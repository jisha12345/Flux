/**
 * One live AI interview over a single WebSocket.
 *
 * Browser sends 16 kHz PCM16LE frames whenever the mic is live; a server-side
 * energy VAD converts them into speech_start/audio/speech_end, STT flushes on
 * speech_end, Claude streams the interviewer's reply, a sentence chunker feeds
 * streaming TTS, and PCM flows back down the same socket. Orchestration
 * (turnId guards, barge-in socket drops, prewarming) follows rocketizer-mono's
 * VoiceStreamSession.
 */
import type WebSocket from "ws";
import { SttStreamSession, TtsStreamSession } from "./audio-stream.js";
import {
  buildSystemPrompt,
  generateBlueprint,
  MarkerFilter,
  streamTurn,
  type HistoryMessage,
} from "./interview-engine.js";
import { evaluateInterview } from "./evaluate.js";
import { PcmVoiceActivityDetector } from "./pcm-vad.js";
import { insertTurn, loadTurns, updateInterview } from "./supabase.js";
import { cleanForTts, SentenceChunker } from "./voice-chunker.js";
import type { AiInterviewRow } from "./types.js";

const WS_OPEN = 1;

/** How long a candidate can sit silent before a gentle nudge (once per question). */
const SILENCE_NUDGE_MS = 18_000;
/** Minutes past the planned duration before we force the wrap-up. */
const OVERTIME_WRAP_MIN = 3;
/** Absolute ceiling past planned duration — hard-complete the interview. */
const OVERTIME_HARD_MIN = 10;

const NUDGE_LINES: Record<string, string> = {
  "en-IN": "Take your time. If it helps, I can repeat the question.",
  "hi-IN": "आराम से सोचिए। चाहें तो मैं सवाल दोहरा सकती हूँ।",
};

export class InterviewSession {
  private readonly stt: SttStreamSession;
  private tts: TtsStreamSession | null = null;
  private readonly vad: PcmVoiceActivityDetector;

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
    this.vad = new PcmVoiceActivityDetector(
      // ~0.02 full-scale on int16; 3×32 ms frames to confirm onset; 800 ms of
      // trailing silence ends the utterance (interview answers pause a lot).
      { rmsThreshold: 650, startFrames: 3, silenceMs: 800, preRollMs: 240 },
      {
        onSpeechStart: () => this.onSpeechStart(),
        onAudio: (pcm) => this.stt.sendPcm(pcm),
        onSpeechEnd: () => this.onSpeechEnd(),
      },
    );
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    // Blueprint on first connect (link creation stays instant).
    if (!this.row.blueprint) {
      this.send({ type: "status", data: "thinking" });
      try {
        const blueprint = await generateBlueprint(this.row);
        this.row = { ...this.row, blueprint };
        await updateInterview(this.row.id, { blueprint });
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
      case "audio": {
        if (typeof msg.data !== "string" || this.completed) return;
        let pcm: Uint8Array;
        try {
          pcm = new Uint8Array(Buffer.from(msg.data, "base64"));
        } catch {
          return;
        }
        this.vad.process(pcm);
        return;
      }
      case "barge_in":
        this.cancelTurn();
        this.vad.reset();
        this.spawn(this.ensureTts());
        this.send({ type: "status", data: "listening" });
        this.armSilenceTimer();
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
    this.cancelTurn();
    this.clearSilenceTimer();
    this.stt.close();
    this.tts?.close();
    this.tts = null;
    // If the candidate dropped mid-interview, leave status in_progress so a
    // reconnect resumes; a long-dead in_progress interview is still evaluable
    // via POST /evaluate/:token.
  }

  // ── mic lifecycle ─────────────────────────────────────────────────────────

  private onSpeechStart(): void {
    this.clearSilenceTimer();
    if (this.turnActive) this.cancelTurn(); // server-side barge-in safety net
    this.transcriptPreview = "";
    this.stt.reset();
  }

  private onSpeechEnd(): void {
    // Off the receive loop so the STT flush cannot block incoming media.
    this.spawn(this.finalizeAndRespond());
  }

  private async finalizeAndRespond(): Promise<void> {
    let transcript = "";
    try {
      transcript = await this.stt.flush();
    } catch {
      transcript = "";
    }
    if (this.completed) return;
    if (transcript) {
      this.beginTurn(transcript);
    } else {
      this.send({ type: "status", data: "listening" });
      this.armSilenceTimer();
    }
  }

  private updateTranscriptPreview(rawText: string): void {
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
    if (!this.lastQuestion || this.turnActive || this.completed) return;
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

  /** Stop the active turn's audio. The LLM stream has no hard-cancel here; a
   *  superseded turn finishes in the background and its late tokens/audio are
   *  dropped via the turnId + audioOpen guards. */
  private cancelTurn(): void {
    if (this.turnActive) {
      this.turnActive = false;
      this.send({ type: "interrupted" });
    }
    this.audioOpen = false;
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

    const content = synthetic ? userText : `${this.stateNote()}\n\n${userText}`;
    const history: HistoryMessage[] = [...this.history, { role: "user", content }];

    await this.ensureTts();
    const chunker = new SentenceChunker();
    let spoke = false;
    let endRequested = false;
    let speakChain: Promise<void> = Promise.resolve();

    const speakSentence = (rawSentence: string) => {
      if (myTurn !== this.turnId) return;
      const cleaned = cleanForTts(rawSentence);
      if (!cleaned) return;
      const tts = this.tts;
      if (tts) speakChain = speakChain.then(() => tts.speak(cleaned)).catch(() => {});
      if (!spoke) {
        spoke = true;
        this.send({ type: "status", data: "speaking" });
      }
      this.send({ type: "assistant_text", text: cleaned });
    };

    const filter = new MarkerFilter(
      (text) => {
        if (myTurn !== this.turnId || !text) return;
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
    this.history.push({ role: "user", content }, { role: "assistant", content: cleanText });
    if (!endRequested) this.lastQuestion = cleanText;
    const seq = this.seq++;
    void insertTurn(this.row.id, seq, "interviewer", cleanText, this.currentSectionId()).catch(() => {});

    await speakChain;
    if (spoke && this.tts) {
      try {
        await this.tts.flushAndWait();
      } catch {
        /* socket dropped / timed out — audio already delivered */
      }
    }
    this.tts = null;
    this.spawn(this.ensureTts()); // prewarm for the next turn

    if (myTurn !== this.turnId) return;
    this.turnActive = false;
    this.audioOpen = false;
    this.send({ type: "audio_done" });

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
    if (this.completed || !this.started || this.nudgedThisQuestion) return;
    this.silenceTimer = setTimeout(() => {
      if (this.turnActive || this.vad.isSpeaking || this.completed) return;
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
      onAudio: (pcm, rate) => this.emitAudio(pcm, rate),
    });
    this.tts = tts;
    return tts.prewarm();
  }

  private emitAudio(pcm: Uint8Array, sampleRate: number): void {
    if (!this.audioOpen || pcm.byteLength === 0) return;
    this.audioSeq += 1;
    this.send({
      type: "audio",
      seq: this.audioSeq,
      sample_rate: sampleRate,
      data: Buffer.from(pcm).toString("base64"),
    });
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
