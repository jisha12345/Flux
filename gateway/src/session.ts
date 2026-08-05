/**
 * One live AI interview over a single WebSocket.
 *
 * The mic is **push-to-talk**: the browser sends `mic_open`, streams 16 kHz
 * PCM16LE while the candidate holds the floor, then sends `mic_close`. Only then
 * does STT flush, Claude stream the interviewer's reply, a sentence chunker feed
 * streaming TTS, and PCM flow back down the same socket.
 *
 * The floor is only ever *taken* by an explicit tap. The earlier energy-VAD
 * build let room noise (and the interviewer's own TTS leaking back through the
 * candidate's speakers) open a "turn", which cancelled the question that was
 * still being generated — so the interviewer would sometimes never ask anything.
 * The browser does auto-*release* the floor after ~1.5 s of trailing silence,
 * which is safe precisely because the mic is only open when the candidate
 * deliberately opened it and the interviewer is therefore not speaking.
 *
 * Every turn logs one `[turn]` line with the four serial stages, so a slow
 * pipeline can be diagnosed instead of guessed at.
 */
import type WebSocket from "ws";
import { SttStreamSession, TtsStreamSession } from "./audio-stream.js";
import { FillerBank } from "./fillers.js";
import {
  buildSystemPrompt,
  ensureBlueprint,
  MarkerFilter,
  streamTurn,
  type HistoryMessage,
} from "./interview-engine.js";
import { evaluateInterview } from "./evaluate.js";
import { pcm16LeRms } from "./pcm-vad.js";
import { insertTurn, loadTurns, updateInterview } from "./supabase.js";
import { cleanForTts, SentenceChunker } from "./voice-chunker.js";
import type { AiInterviewRow } from "./types.js";

const WS_OPEN = 1;

/** How long a candidate can sit silent before a gentle nudge (once per question). */
const SILENCE_NUDGE_MS = 25_000;
/** Minutes past the planned duration before we force the wrap-up. */
const OVERTIME_WRAP_MIN = 3;
/** Absolute ceiling past planned duration — hard-complete the interview. */
const OVERTIME_HARD_MIN = 10;

/** Raw int16 RMS above which a mic frame counts as "someone actually spoke". */
const VOICED_RMS = 500;
/** Frames (~32 ms each) of voiced audio needed before we bother flushing STT. */
const MIN_VOICED_FRAMES = 6;

const NUDGE_LINES: Record<string, string> = {
  "en-IN": "Take your time. Tap the speak button when you're ready — or I can repeat the question.",
  "hi-IN": "आराम से सोचिए। जब तैयार हों तो बोलने वाला बटन दबाइए — या मैं सवाल दोहरा सकती हूँ।",
};

/**
 * Wall-clock marks for one candidate turn, from the moment they hand the floor
 * back to the moment they hear something. Logged once per turn — the pipeline
 * has four serial stages and guessing which one is slow never worked.
 */
interface TurnTiming {
  micClosedAt: number;
  fillerMs: number;
  sttMs: number;
  firstDeltaMs: number;
  logged: boolean;
}

export class InterviewSession {
  private readonly stt: SttStreamSession;
  private readonly fillers: FillerBank;
  private tts: TtsStreamSession | null = null;

  private history: HistoryMessage[] = [];
  private system = "";
  private seq = 0; // DB turn sequence
  private turnId = 0;
  private turnActive = false;
  private audioOpen = false;
  private audioSeq = 0;
  private started = false;
  private completed = false;
  private closed = false;

  private micOpen = false;
  private voicedFrames = 0;
  private turnTiming: TurnTiming | null = null;
  /** A candidate turn whose reply came back empty — folded into the next turn. */
  private pendingUserContent = "";

  private sectionIndex = -1;
  private startedAtMs = 0;
  private lastQuestion = "";
  private transcriptPreview = "";
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private nudgedThisQuestion = false;
  private currentTurn: Promise<void> = Promise.resolve();
  private readonly bg = new Set<Promise<unknown>>();

  constructor(
    private readonly ws: WebSocket,
    private row: AiInterviewRow,
  ) {
    this.stt = new SttStreamSession(row.language, {
      onTranscript: (text) => this.updateTranscriptPreview(text),
    });
    this.fillers = new FillerBank(row.language);
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    // Normally already on disk: `POST /prepare/:token` runs at link creation, and
    // the browser connects during the device check. This is the fallback path.
    if (!this.row.blueprint) {
      this.send({ type: "status", data: "thinking" });
      try {
        const blueprint = await ensureBlueprint(this.row);
        this.row = { ...this.row, blueprint };
      } catch (err) {
        console.error("[session] blueprint generation failed:", err);
        this.send({ type: "error", message: "Could not prepare the interview. Please try again shortly." });
        this.ws.close(1011, "blueprint_failed");
        return;
      }
    }
    this.system = buildSystemPrompt(this.row, this.row.blueprint!);

    // Resume support: rebuild history from persisted turns.
    const turns = await loadTurns(this.row.id);
    for (const t of turns) {
      if (t.role === "candidate") this.history.push({ role: "user", content: t.text });
      else if (t.role === "interviewer") {
        this.history.push({ role: "assistant", content: t.text });
        this.lastQuestion = t.text;
      }
      this.seq = Math.max(this.seq, t.seq + 1);
    }
    if (this.row.started_at) this.startedAtMs = new Date(this.row.started_at).getTime();

    await Promise.allSettled([this.stt.prewarm(), this.ensureTts()]);

    const blueprint = this.row.blueprint!;
    this.send({
      type: "ready",
      interview: {
        candidate_name: this.row.candidate_name,
        role_title: this.row.role_title,
        company: this.row.company_name,
        language: this.row.language,
        duration_minutes: this.row.duration_minutes,
        sections: blueprint.sections.map((s) => ({ id: s.id, title: s.title })),
      },
    });
  }

  handleMessage(raw: string): void {
    let msg: { type?: string; data?: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg?.type) {
      case "start":
        this.handleStart();
        return;
      case "mic_open":
        this.openMic();
        return;
      case "audio": {
        // Nothing is listened to unless the candidate is holding the floor.
        if (!this.micOpen || typeof msg.data !== "string" || this.completed) return;
        let pcm: Uint8Array;
        try {
          pcm = new Uint8Array(Buffer.from(msg.data, "base64"));
        } catch {
          return;
        }
        if (pcm.byteLength < 2) return;
        if (pcm16LeRms(pcm) >= VOICED_RMS) this.voicedFrames += 1;
        // Forward the base64 we were handed — the decode above is only for the
        // energy check, and re-encoding it would be pure waste per 32 ms frame.
        this.stt.sendPcmBase64(msg.data);
        return;
      }
      case "mic_close":
        this.closeMic();
        return;
      case "repeat":
        this.handleRepeat();
        return;
      case "text": {
        const text = typeof msg.data === "string" ? msg.data.trim() : "";
        if (!text || this.completed) return;
        this.beginTurn(text);
        return;
      }
      case "end":
        this.spawn(this.complete("candidate_ended"));
        return;
      default:
        return;
    }
  }

  teardown(): void {
    this.closed = true;
    this.micOpen = false;
    this.cancelTurn();
    this.clearSilenceTimer();
    this.stt.close();
    this.tts?.close();
    this.tts = null;
    // If the candidate dropped mid-interview, leave status in_progress so a
    // reconnect resumes; a long-dead in_progress interview is still evaluable
    // via POST /evaluate/:token.
  }

  // ── mic lifecycle (push-to-talk) ──────────────────────────────────────────

  /** Candidate tapped "speak". Takes the floor — including from the interviewer. */
  private openMic(): void {
    if (this.completed || this.micOpen) return;
    this.clearSilenceTimer();
    // A tap during the question is a deliberate interruption, never an accident.
    if (this.turnActive) this.cancelTurn();
    this.micOpen = true;
    this.voicedFrames = 0;
    this.transcriptPreview = "";
    this.stt.reset();
    this.spawn(this.stt.prewarm()); // the socket may have gone idle between turns
    this.spawn(this.ensureTts());
    this.send({ type: "status", data: "listening" });
  }

  /** Candidate tapped "send". Finalize the utterance and answer it. */
  private closeMic(): void {
    if (!this.micOpen) return;
    this.micOpen = false;
    if (this.completed) return;

    if (this.voicedFrames < MIN_VOICED_FRAMES) {
      // Empty tap (mis-tap, muted mic, hardware trouble) — never send it to the
      // model as a turn; nudging the candidate to retry is the honest response.
      this.stt.reset();
      this.transcriptPreview = "";
      this.send({ type: "no_speech" });
      this.send({ type: "status", data: "listening" });
      this.armSilenceTimer();
      return;
    }

    this.turnTiming = {
      micClosedAt: Date.now(),
      fillerMs: -1,
      sttMs: -1,
      firstDeltaMs: -1,
      logged: false,
    };
    this.send({ type: "status", data: "thinking" });
    // A real interviewer says "got it" while they think, rather than going
    // silent for a second and a half. This clip is already synthesized, so it
    // reaches the candidate's speakers before STT has even finished flushing.
    this.playFiller();
    // Off the receive loop so the STT flush cannot block incoming frames.
    this.spawn(this.finalizeAndRespond());
  }

  /** Play a cached acknowledgement over the STT + LLM + TTS gap. */
  private playFiller(): void {
    const clip = this.fillers.next();
    if (!clip) return;
    this.emitPcm(clip, this.fillers.sampleRate);
    if (this.turnTiming) this.turnTiming.fillerMs = Date.now() - this.turnTiming.micClosedAt;
  }

  private async finalizeAndRespond(): Promise<void> {
    const startedAt = Date.now();
    let transcript = "";
    try {
      transcript = await this.stt.flush();
    } catch {
      transcript = "";
    }
    if (this.turnTiming) this.turnTiming.sttMs = Date.now() - startedAt;
    if (this.completed || this.micOpen) return; // mic re-opened while flushing
    if (transcript) {
      this.beginTurn(transcript);
    } else {
      this.send({ type: "no_speech" });
      this.send({ type: "status", data: "listening" });
      this.armSilenceTimer();
    }
  }

  private updateTranscriptPreview(rawText: string): void {
    if (!this.micOpen) return; // stale segment from a finished utterance
    const text = rawText.replace(/\s+/g, " ").trim();
    if (!text) return;
    if (!this.transcriptPreview) {
      this.transcriptPreview = text;
    } else if (text === this.transcriptPreview || this.transcriptPreview.endsWith(text)) {
      return;
    } else if (text.startsWith(this.transcriptPreview)) {
      this.transcriptPreview = text;
    } else {
      this.transcriptPreview = `${this.transcriptPreview} ${text}`.replace(/\s+/g, " ").trim();
    }
    this.send({ type: "transcript", role: "user", text: this.transcriptPreview, final: false });
  }

  // ── turns ─────────────────────────────────────────────────────────────────

  private handleStart(): void {
    if (this.started || this.completed) return;
    this.started = true;
    if (!this.startedAtMs) {
      this.startedAtMs = Date.now();
      void updateInterview(this.row.id, { status: "in_progress", started_at: new Date().toISOString() });
    }
    const opening =
      this.history.length === 0
        ? "[The candidate has just joined the call. Greet them warmly by name, introduce yourself and how the interview will flow in a couple of sentences, then ask your first question. Begin your reply with [SECTION:intro].]"
        : "[The candidate has reconnected after a drop. Welcome them back briefly and repeat your last question so they can continue.]";
    this.beginTurn(opening, { synthetic: true });
  }

  private handleRepeat(): void {
    if (!this.lastQuestion || this.turnActive || this.micOpen || this.completed) return;
    const line = cleanForTts(this.lastQuestion);
    if (line) this.spawn(this.speakLine(line));
  }

  private beginTurn(userText: string, opts: { synthetic?: boolean } = {}): void {
    this.cancelTurn();
    this.clearSilenceTimer();
    this.nudgedThisQuestion = false;
    this.turnId += 1;
    const myTurn = this.turnId;
    this.audioOpen = true;
    this.currentTurn = this.runTurn(userText, myTurn, opts.synthetic === true);
    this.spawn(this.currentTurn);
  }

  /** Stop the active turn's audio. The LLM stream has no hard-cancel here, so we
   *  orphan the turn by bumping turnId: every emit path in runTurn re-checks it,
   *  and a dropped TtsStreamSession's audio is discarded by the ownership check
   *  in ensureTts. Late tokens from the superseded turn therefore go nowhere. */
  private cancelTurn(): void {
    if (this.turnActive) {
      this.turnActive = false;
      this.send({ type: "interrupted" });
    }
    this.audioOpen = false;
    this.turnId += 1;
    if (this.tts && this.tts.busy) {
      this.tts.reset();
      this.tts = null;
    }
  }

  private stateNote(): string {
    const blueprint = this.row.blueprint!;
    const elapsedMin = this.startedAtMs ? (Date.now() - this.startedAtMs) / 60_000 : 0;
    const total = this.row.duration_minutes;
    const section = blueprint.sections[Math.max(0, this.sectionIndex)];
    const plannedThrough = blueprint.sections
      .slice(0, Math.max(0, this.sectionIndex) + 1)
      .reduce((sum, s) => sum + s.minutes, 0);

    let note = `[state: ${Math.round(elapsedMin)} of ${total} minutes elapsed; current section: ${section?.id ?? "intro"}]`;
    if (elapsedMin >= total + OVERTIME_WRAP_MIN) {
      note += ` [note: time is up — deliver your closing reply now and end it with [END_INTERVIEW]]`;
    } else if (elapsedMin >= total - 4) {
      note += ` [note: under ${Math.max(1, Math.round(total - elapsedMin))} minutes remain — move to the final section and begin wrapping up]`;
    } else if (this.sectionIndex >= 0 && elapsedMin > plannedThrough) {
      note += ` [note: this section's time is up — transition to the next section in your reply]`;
    }
    return note;
  }

  private async runTurn(userText: string, myTurn: number, synthetic: boolean): Promise<void> {
    this.turnActive = true;
    this.audioSeq = 0;

    if (!synthetic) {
      this.transcriptPreview = userText;
      this.send({ type: "transcript", role: "user", text: userText, final: true });
      const seq = this.seq++;
      void insertTurn(this.row.id, seq, "candidate", userText, this.currentSectionId()).catch(() => {});
    }
    this.send({ type: "status", data: "thinking" });

    const turnText = synthetic ? userText : `${this.stateNote()}\n\n${userText}`;
    const content = this.pendingUserContent
      ? `${this.pendingUserContent}\n\n${turnText}`
      : turnText;
    this.pendingUserContent = "";
    const history: HistoryMessage[] = [...this.history, { role: "user", content }];

    // `ensureTts` assigns `this.tts` synchronously and only the handshake is
    // async, so awaiting it here just parked the model request behind a Sarvam
    // connect. Let them race; `speak()` waits on the socket itself.
    this.spawn(this.ensureTts());
    const chunker = new SentenceChunker();
    let spoke = false;
    let endRequested = false;
    let speakChain: Promise<void> = Promise.resolve();

    const speakSentence = (rawSentence: string) => {
      if (myTurn !== this.turnId) return;
      const cleaned = cleanForTts(rawSentence);
      if (!cleaned) return;
      const tts = this.tts;
      if (tts) {
        speakChain = speakChain
          .then(() => (myTurn === this.turnId ? tts.speak(cleaned) : undefined))
          .catch(() => {});
      }
      if (!spoke) {
        spoke = true;
        this.send({ type: "status", data: "speaking" });
      }
      this.send({ type: "assistant_text", text: cleaned });
    };

    const filter = new MarkerFilter(
      (text) => {
        if (myTurn !== this.turnId || !text) return;
        const timing = this.turnTiming;
        if (timing && timing.firstDeltaMs < 0) {
          timing.firstDeltaMs = Date.now() - timing.micClosedAt;
        }
        this.send({ type: "assistant_delta", text });
        for (const sentence of chunker.feed(text)) speakSentence(sentence);
      },
      {
        onSection: (id) => {
          if (myTurn !== this.turnId) return;
          this.enterSection(id);
        },
        onEnd: () => {
          endRequested = true;
        },
      },
    );

    let fullText = "";
    try {
      fullText = await streamTurn({
        system: this.system,
        history,
        onDelta: (delta) => filter.feed(delta),
      });
    } catch (err) {
      if (myTurn !== this.turnId) return;
      console.error("[session] turn failed:", err);
      this.turnActive = false;
      this.audioOpen = false;
      this.send({ type: "error", message: "The interviewer hit a glitch — give it a second and speak again." });
      this.send({ type: "status", data: "listening" });
      this.armSilenceTimer();
      return;
    }

    if (myTurn !== this.turnId) return; // barged in mid-turn
    filter.flush();
    const tail = chunker.flush();
    if (tail) speakSentence(tail);

    // Persist with markers stripped; keep history in the same clean form.
    const cleanText = fullText
      .replace(/\[SECTION:[a-z0-9_-]+\]/gi, "")
      .replace(/\[END_INTERVIEW\]/gi, "")
      .trim();
    // An empty assistant message makes the *next* request 400 and takes the
    // rest of the interview down with it — keep the history well-formed.
    if (cleanText) {
      this.history.push({ role: "user", content }, { role: "assistant", content: cleanText });
      if (!endRequested) this.lastQuestion = cleanText;
      const seq = this.seq++;
      void insertTurn(this.row.id, seq, "interviewer", cleanText, this.currentSectionId()).catch(() => {});
    } else {
      // Carry the candidate's answer into the next turn rather than leaving
      // history ending on a user message.
      console.warn("[session] empty interviewer turn — carrying the answer forward");
      this.pendingUserContent = content;
    }

    await speakChain;
    if (spoke && this.tts && myTurn === this.turnId) {
      try {
        await this.tts.flushAndWait();
      } catch {
        /* socket dropped / timed out — audio already delivered */
      }
    }
    // Only the still-current turn owns `this.tts`; a superseded one must not
    // null out the session the new turn is already speaking through.
    if (myTurn !== this.turnId) return;
    this.tts = null;
    this.spawn(this.ensureTts()); // prewarm for the next turn

    this.turnActive = false;
    this.audioOpen = false;
    this.send({ type: "audio_done" });
    // Warm the acknowledgement bank once the greeting is out — synthesizing it
    // any earlier would compete with the audio the candidate is waiting on.
    this.spawn(this.fillers.warm());

    const overHardCap =
      this.startedAtMs > 0 &&
      Date.now() - this.startedAtMs > (this.row.duration_minutes + OVERTIME_HARD_MIN) * 60_000;
    if (endRequested || overHardCap) {
      await this.complete(endRequested ? "interview_finished" : "overtime");
      return;
    }
    this.send({ type: "status", data: "listening" });
    this.armSilenceTimer();
  }

  private currentSectionId(): string | null {
    return this.row.blueprint?.sections[this.sectionIndex]?.id ?? null;
  }

  private enterSection(id: string): void {
    const sections = this.row.blueprint?.sections ?? [];
    const index = sections.findIndex((s) => s.id === id);
    if (index === -1 || index === this.sectionIndex) return;
    this.sectionIndex = index;
    this.send({
      type: "section",
      id,
      title: sections[index].title,
      index,
      total: sections.length,
    });
  }

  /** Speak a canned line through TTS without an LLM round-trip. */
  private async speakLine(line: string): Promise<void> {
    this.turnId += 1;
    const myTurn = this.turnId;
    this.turnActive = true;
    this.audioOpen = true;
    this.audioSeq = 0;
    this.send({ type: "status", data: "speaking" });
    this.send({ type: "assistant_text", text: line });
    this.send({ type: "assistant_delta", text: line });

    await this.ensureTts();
    const tts = this.tts;
    try {
      await tts?.speak(line);
      await tts?.flushAndWait();
    } catch {
      /* barge-in deliberately drops this TTS socket */
    }
    if (this.tts === tts) this.tts = null;
    this.spawn(this.ensureTts());
    if (myTurn !== this.turnId || !this.turnActive) return;

    this.turnActive = false;
    this.audioOpen = false;
    this.send({ type: "audio_done" });
    this.send({ type: "status", data: "listening" });
    this.armSilenceTimer();
  }

  private async complete(reason: string): Promise<void> {
    if (this.completed) return;
    this.completed = true;
    this.cancelTurn();
    this.clearSilenceTimer();
    console.log(`[session] interview ${this.row.id} completed (${reason})`);
    await updateInterview(this.row.id, { status: "completed", ended_at: new Date().toISOString() });
    this.send({ type: "completed" });
    // Evaluation runs in this process regardless of the socket's fate.
    const row = { ...this.row, status: "completed" as const };
    void evaluateInterview(row).catch((err) => console.error("[evaluate] crashed:", err));
  }

  // ── silence nudge ─────────────────────────────────────────────────────────

  private armSilenceTimer(): void {
    this.clearSilenceTimer();
    if (this.completed || !this.started || this.nudgedThisQuestion || this.micOpen) return;
    this.silenceTimer = setTimeout(() => {
      if (this.turnActive || this.micOpen || this.completed) return;
      this.nudgedThisQuestion = true;
      const line = NUDGE_LINES[this.row.language] ?? NUDGE_LINES["en-IN"];
      this.spawn(this.speakLine(line));
    }, SILENCE_NUDGE_MS);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  // ── plumbing ──────────────────────────────────────────────────────────────

  private ensureTts(): Promise<void> {
    if (this.tts) return Promise.resolve();
    const tts = new TtsStreamSession(this.row.language, {
      // Ownership check: an orphaned session (barge-in, superseded turn) can
      // still reconnect on a queued speak() — its audio must never reach the
      // candidate mid-way through the next question.
      onAudio: (pcm, rate) => {
        if (this.tts === tts) this.emitAudio(pcm, rate);
      },
    });
    this.tts = tts;
    return tts.prewarm();
  }

  private emitAudio(pcm: Uint8Array, sampleRate: number): void {
    if (!this.audioOpen || pcm.byteLength === 0) return;

    const timing = this.turnTiming;
    if (timing && !timing.logged) {
      timing.logged = true;
      console.log(
        `[turn] first_audio=${Date.now() - timing.micClosedAt}ms ` +
          `filler=${timing.fillerMs}ms stt_flush=${timing.sttMs}ms ` +
          `first_token=${timing.firstDeltaMs}ms`,
      );
    }
    this.emitPcm(pcm, sampleRate);
  }

  /**
   * Interviewer audio as a binary frame: [uint32 seq][uint32 sampleRate][PCM16LE].
   *
   * This is the fattest thing on the socket, and base64-in-JSON added a third
   * again on top of it plus an encode here and a decode in the browser. The
   * candidate's connection is the one place we cannot make faster, so we send
   * it fewer bytes.
   */
  private emitPcm(pcm: Uint8Array, sampleRate: number): void {
    if (this.closed || this.ws.readyState !== WS_OPEN || pcm.byteLength === 0) return;
    this.audioSeq += 1;
    const frame = Buffer.allocUnsafe(8 + pcm.byteLength);
    frame.writeUInt32LE(this.audioSeq, 0);
    frame.writeUInt32LE(sampleRate, 4);
    frame.set(pcm, 8);
    try {
      this.ws.send(frame);
    } catch {
      /* client gone */
    }
  }

  private send(obj: unknown): void {
    if (this.closed || this.ws.readyState !== WS_OPEN) return;
    try {
      this.ws.send(JSON.stringify(obj));
    } catch {
      /* client gone */
    }
  }

  private spawn(p: Promise<unknown>): void {
    this.bg.add(p);
    void p.catch(() => {}).finally(() => this.bg.delete(p));
  }
}
