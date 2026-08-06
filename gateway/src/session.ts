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
import { serializeIntegrityEvent } from "./integrity.js";
import { pcm16LeRms } from "./pcm-vad.js";
import { redactSensitiveText } from "./privacy.js";
import { insertTurn, loadTurns, updateInterview } from "./supabase.js";
import { cleanForTts, SentenceChunker } from "./voice-chunker.js";
import type { AiInterviewRow, IntegrityEventType, TurnRow } from "./types.js";

const WS_OPEN = 1;

/** How long a candidate can sit silent before a gentle nudge (once per question). */
const SILENCE_NUDGE_MS = 25_000;
/** Minutes past the planned duration before we force the wrap-up. */
const OVERTIME_WRAP_MIN = 3;
/** Absolute ceiling past planned duration — hard-complete the interview. */
const OVERTIME_HARD_MIN = 10;
/** Waiting this long for an answer is recorded as an extended break. */
const LONG_BREAK_MS = 60_000;

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
  /** When the model stopped generating. `first_audio - llm_done` is the TTS
   *  share of the wait, which is otherwise indistinguishable from a slow model. */
  llmDoneMs: number;
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
  /** Whether this turn has put a single audible byte on the wire yet. */
  private spokeAudio = false;
  private started = false;
  private completed = false;
  private closing = false;
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
  private waitingSinceMs = 0;
  private nudgedThisQuestion = false;
  private currentTurn: Promise<void> = Promise.resolve();
  private readonly bg = new Set<Promise<unknown>>();
  private readonly writes = new Set<Promise<void>>();

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

    // Warm the acknowledgement bank now, while the candidate is still on the
    // device check. It used to warm after the greeting, which put six sequential
    // Sarvam handshakes in the same window as the first real answer — and the
    // clips aren't needed until the first `mic_close` anyway. Not awaited: it
    // must never hold up `ready`.
    this.spawn(this.fillers.warm());

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
    let msg: {
      type?: string;
      data?: unknown;
      event?: unknown;
      occurred_at?: unknown;
      duration_seconds?: unknown;
    };
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
        if (!text || this.completed || this.closing) return;
        this.recordLongBreakIfNeeded();
        this.beginTurn(text);
        return;
      }
      case "integrity":
        this.captureIntegrityEvent(msg.event, msg.occurred_at, msg.duration_seconds);
        return;
      case "end":
        this.recordLongBreakIfNeeded();
        this.spawn(this.closeWithThanks("candidate_ended"));
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
    if (this.completed || this.closing || this.micOpen) return;
    this.recordLongBreakIfNeeded();
    this.clearSilenceTimer();
    // A tap during the question is a deliberate interruption, never an accident.
    if (this.turnActive) this.cancelTurn();
    this.micOpen = true;
    this.voicedFrames = 0;
    this.transcriptPreview = "";
    this.stt.reset();
    this.spawn(this.stt.prewarm()); // the socket may have gone idle between turns
    // No TTS prewarm here on purpose — an answer routinely runs past Sarvam's
    // 60 s idle limit, so a socket opened now would be reaped before the reply
    // it was opened for. `closeMic` warms it instead, when the reply is seconds
    // away rather than minutes.
    this.send({ type: "status", data: "listening" });
  }

  /** Candidate tapped "send". Finalize the utterance and answer it. */
  private closeMic(): void {
    if (!this.micOpen) return;
    this.micOpen = false;
    if (this.completed || this.closing) return;

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
      llmDoneMs: -1,
      logged: false,
    };
    this.send({ type: "status", data: "thinking" });
    // The one moment worth prewarming TTS: the reply is a few seconds out, well
    // inside Sarvam's 60 s idle window. Revives the socket if it was reaped
    // while the candidate was talking.
    this.spawn(this.ensureTts());
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
    if (this.completed || this.closing || this.micOpen) return; // mic re-opened or interview ended while flushing
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
    const firstName = this.canonicalFirstName();
    if (this.history.length === 0) {
      // The greeting is deliberately scripted: the canonical DB name is never
      // left to model inference from CV context or a prior candidate.
      const opening = this.scriptedOpening(firstName);
      this.enterSection("intro");
      this.spawn(
        this.speakLine(opening, {
          persist: true,
          historyUser: "[The candidate joined the interview and received the standard introduction.]",
        }),
      );
      return;
    }
    const reconnect =
      this.row.language === "hi-IN"
        ? this.lastQuestion
          ? `वापस स्वागत है, ${firstName}। चलिए आगे बढ़ते हैं। ${this.lastQuestion}`
          : `वापस स्वागत है, ${firstName}। चलिए इंटरव्यू आगे बढ़ाते हैं।`
        : this.lastQuestion
          ? `Welcome back, ${firstName}. Let's continue. ${this.lastQuestion}`
          : `Welcome back, ${firstName}. Let's continue with the interview.`;
    this.spawn(this.speakLine(reconnect));
  }

  private handleRepeat(): void {
    if (!this.lastQuestion || this.turnActive || this.micOpen || this.completed || this.closing) return;
    this.recordLongBreakIfNeeded();
    this.clearSilenceTimer();
    const line = cleanForTts(this.lastQuestion);
    if (line) this.spawn(this.speakLine(line));
  }

  private beginTurn(userText: string, opts: { synthetic?: boolean } = {}): void {
    if (this.completed || this.closing) return;
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
    this.spokeAudio = false;

    if (!synthetic) {
      const safeUserText = redactSensitiveText(userText);
      this.transcriptPreview = safeUserText;
      this.send({ type: "transcript", role: "user", text: safeUserText, final: true });
      const seq = this.seq++;
      this.persistTurn(seq, "candidate", safeUserText, this.currentSectionId());
      userText = safeUserText;
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
      spoke = true;
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
    if (this.turnTiming && this.turnTiming.llmDoneMs < 0) {
      this.turnTiming.llmDoneMs = Date.now() - this.turnTiming.micClosedAt;
    }
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
      this.persistTurn(seq, "interviewer", cleanText, this.currentSectionId());
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
    // Deliberately no prewarm for the next turn: the candidate now thinks and
    // answers, which routinely exceeds Sarvam's 60 s idle limit, so the socket
    // would be reaped and the reconnect paid anyway — after logging a 408 that
    // looked like a real fault. `closeMic` opens it at the right moment.

    this.turnActive = false;
    this.audioOpen = false;
    this.send({ type: "audio_done" });

    const overHardCap =
      this.startedAtMs > 0 &&
      Date.now() - this.startedAtMs > (this.row.duration_minutes + OVERTIME_HARD_MIN) * 60_000;
    if (endRequested) {
      await this.complete("interview_finished");
      return;
    }
    if (overHardCap) {
      await this.closeWithThanks("overtime");
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
  private async speakLine(
    line: string,
    options: { persist?: boolean; historyUser?: string; completeReason?: string } = {},
  ): Promise<void> {
    this.turnId += 1;
    const myTurn = this.turnId;
    this.turnActive = true;
    this.audioOpen = true;
    this.audioSeq = 0;
    this.spokeAudio = false; // `emitAudio` announces "speaking" once audio lands
    this.send({ type: "assistant_text", text: line });

    await this.ensureTts();
    const tts = this.tts;
    try {
      await tts?.speak(line);
      await tts?.flushAndWait();
    } catch {
      /* barge-in deliberately drops this TTS socket */
    }
    if (this.tts === tts) this.tts = null;
    if (myTurn !== this.turnId || !this.turnActive) return;

    this.turnActive = false;
    this.audioOpen = false;
    this.send({ type: "audio_done" });
    if (options.persist) {
      const historyUser = options.historyUser ?? "[The system delivered a scripted interviewer message.]";
      this.history.push(
        { role: "user", content: historyUser },
        { role: "assistant", content: line },
      );
      this.lastQuestion = line;
      const seq = this.seq++;
      this.persistTurn(seq, "interviewer", line, this.currentSectionId());
    }
    if (options.completeReason) {
      await this.complete(options.completeReason);
      return;
    }
    this.send({ type: "status", data: "listening" });
    this.armSilenceTimer();
  }

  private async closeWithThanks(reason: string): Promise<void> {
    if (this.completed || this.closing) return;
    this.closing = true;
    this.micOpen = false;
    this.cancelTurn();
    this.clearSilenceTimer();
    const line = this.scriptedClosing();
    await this.speakLine(line, {
      persist: true,
      historyUser: `[The interview ended: ${reason}. Deliver the standard closing.]`,
      completeReason: reason,
    });
  }

  private async complete(reason: string): Promise<void> {
    if (this.completed) return;
    this.completed = true;
    this.cancelTurn();
    this.clearSilenceTimer();
    console.log(`[session] interview ${this.row.id} completed (${reason})`);
    await updateInterview(this.row.id, { status: "completed", ended_at: new Date().toISOString() });
    // Evaluation must see the final answer, closing, and integrity signals even
    // though turn persistence is intentionally off the audio-critical path.
    await Promise.allSettled([...this.writes]);
    this.send({ type: "completed" });
    // Evaluation runs in this process regardless of the socket's fate.
    const row = { ...this.row, status: "completed" as const };
    void evaluateInterview(row).catch((err) => console.error("[evaluate] crashed:", err));
  }

  // ── silence nudge ─────────────────────────────────────────────────────────

  private armSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.completed || !this.started || this.nudgedThisQuestion || this.micOpen) return;
    if (!this.waitingSinceMs) this.waitingSinceMs = Date.now();
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
    this.waitingSinceMs = 0;
  }

  private recordLongBreakIfNeeded(): void {
    if (!this.waitingSinceMs) return;
    const durationMs = Date.now() - this.waitingSinceMs;
    this.waitingSinceMs = 0;
    if (durationMs < LONG_BREAK_MS) return;
    this.persistIntegrityEvent("long_break", new Date(Date.now() - durationMs), durationMs / 1000);
  }

  private captureIntegrityEvent(event: unknown, occurredAt: unknown, duration: unknown): void {
    if (!this.started || this.completed) return;
    if (
      event !== "tab_hidden" &&
      event !== "window_blur" &&
      event !== "fullscreen_exit"
    ) {
      return;
    }
    const parsedAt = new Date(typeof occurredAt === "string" ? occurredAt : Date.now());
    const safeAt = Number.isNaN(parsedAt.getTime()) ? new Date() : parsedAt;
    const safeDuration = typeof duration === "number" && Number.isFinite(duration) ? duration : 0;
    this.persistIntegrityEvent(event, safeAt, safeDuration);
  }

  private persistIntegrityEvent(
    eventType: IntegrityEventType,
    occurredAt: Date,
    durationSeconds: number,
  ): void {
    const seq = this.seq++;
    const text = serializeIntegrityEvent({
      event_type: eventType,
      occurred_at: occurredAt.toISOString(),
      duration_seconds: durationSeconds,
    });
    this.persistTurn(seq, "system", text, this.currentSectionId());
  }

  private persistTurn(
    seq: number,
    role: TurnRow["role"],
    text: string,
    section: string | null,
  ): void {
    const write = insertTurn(this.row.id, seq, role, text, section);
    this.writes.add(write);
    void write.finally(() => this.writes.delete(write));
  }

  private canonicalFirstName(): string {
    const first = this.row.candidate_name.trim().split(/\s+/)[0] || "Candidate";
    return first.replace(/[\r\n<>[\]{}]/g, "").slice(0, 60) || "Candidate";
  }

  private scriptedOpening(firstName: string): string {
    if (this.row.language === "hi-IN") {
      return (
        `नमस्ते ${firstName}, मैं ${this.row.blueprint?.persona_name ?? "Aria"} हूँ, ${this.row.company_name} की एआई इंटरव्यूअर। ` +
        `हम ${this.row.role_title} भूमिका के लिए आपके अनुभव पर बात करेंगे। शुरुआत में, अपनी वर्तमान भूमिका और इस अवसर से जुड़े सबसे प्रासंगिक अनुभव के बारे में संक्षेप में बताइए।`
      );
    }
    return (
      `Hello ${firstName}, I'm ${this.row.blueprint?.persona_name ?? "Aria"}, your AI interviewer for ` +
      `${this.row.company_name}. We'll discuss your experience for the ${this.row.role_title} role. ` +
      "To begin, could you briefly introduce your current role and the experience most relevant to this opportunity?"
    );
  }

  private scriptedClosing(): string {
    const firstName = this.canonicalFirstName();
    if (this.row.language === "hi-IN") {
      return (
        `धन्यवाद, ${firstName}। ${this.row.role_title} भूमिका के लिए आपका इंटरव्यू यहीं पूरा होता है। ` +
        `${this.row.company_name} की टीम आपके इंटरव्यू की समीक्षा करेगी और अगले चरणों के बारे में आपसे संपर्क करेगी। आपका दिन शुभ हो।`
      );
    }
    return (
      `Thank you, ${firstName}. That brings us to the end of your interview ` +
      `for the ${this.row.role_title} role. We appreciate your time. The ${this.row.company_name} ` +
      "team will review your interview and be in touch about next steps. Have a good day."
    );
  }

  // ── plumbing ──────────────────────────────────────────────────────────────

  private ensureTts(): Promise<void> {
    // `prewarm` is a no-op on a live socket and reconnects a reaped one, so an
    // existing session still gets revived. Returning early here instead meant a
    // socket Sarvam had already closed sat around looking healthy until the
    // reply itself paid for the reconnect.
    if (this.tts) return this.tts.prewarm();
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

    // "Speaking" is announced here, on the first audible byte — not when the
    // first sentence was handed to TTS. Announcing it at queue time meant the
    // candidate watched a speaking indicator through however long synthesis
    // took, which reads as the interviewer having frozen mid-sentence; and if
    // TTS then failed outright, the turn had claimed to speak and never did.
    if (!this.spokeAudio) {
      this.spokeAudio = true;
      this.send({ type: "status", data: "speaking" });
    }

    const timing = this.turnTiming;
    if (timing && !timing.logged) {
      timing.logged = true;
      // `llm_done=streaming` is the healthy case: TTS got going before the model
      // finished. A number means audio only started afterwards, and the gap to
      // first_audio is time spent purely in TTS — the one thing the old log
      // could not distinguish from a slow model.
      const llmDone = timing.llmDoneMs < 0 ? "streaming" : `${timing.llmDoneMs}ms`;
      console.log(
        `[turn] first_audio=${Date.now() - timing.micClosedAt}ms ` +
          `filler=${timing.fillerMs}ms stt_flush=${timing.sttMs}ms ` +
          `first_token=${timing.firstDeltaMs}ms llm_done=${llmDone}`,
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
