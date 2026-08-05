/**
 * Sarvam streaming Speech-to-Text and Text-to-Speech over WebSocket.
 *
 * These power the low-latency interview voice pipeline: the browser WebSocket
 * carries raw 16 kHz PCM up (mic) and the session streams it into a persistent
 * Sarvam STT socket; the reply is sentence-chunked and pushed into a
 * per-utterance Sarvam TTS socket that returns raw PCM in ~0.2 s, so the
 * interviewer starts speaking while the model is still generating.
 *
 * Protocol (validated live against api.sarvam.ai — ported from rocketizer-mono
 * packages/ai/src/audio-stream.ts):
 *   STT connect : wss://api.sarvam.ai/speech-to-text/ws?model=..&language-code=..
 *                 &sample_rate=16000&input_audio_codec=pcm_s16le&vad_signals=true
 *                 header: Api-Subscription-Key
 *         send  : {"audio":{"data":<base64 pcm16le>,"sample_rate":"16000","encoding":"audio/wav"}}
 *         flush : {"type":"flush"}
 *         recv  : {"type":"data","data":{"transcript":"..."}}
 *   TTS connect : wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v3&send_completion_event=true
 *                 header: api-subscription-key
 *         send  : {"type":"config","data":{...output_audio_codec:"linear16"...}}   (first)
 *                 {"type":"text","data":{"text":"..."}}
 *                 {"type":"flush"}
 *         recv  : {"type":"audio","data":{"audio":"<base64 pcm s16le>"}}
 *                 {"type":"event","data":{"event_type":"final"}}
 */
import WebSocket, { type RawData } from "ws";
import { env } from "./env.js";

const STT_SAMPLE_RATE = 16000;

function rawToString(data: RawData): string {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return Buffer.from(data as Buffer).toString("utf8");
}

function wsUrl(path: string): string {
  return `${env.SARVAM_BASE_URL.replace(/\/$/, "").replace(/^http/, "ws")}${path}`;
}

/**
 * A tiny single-consumer signal queue. `put` hands the value to a waiting
 * `get` or buffers it; `get` resolves with the next value or `null` on timeout.
 */
class SignalQueue {
  private items: string[] = [];
  private waiter: { resolve: (v: string | null) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private generation = 0;

  /** Bumped by `reset`. A consumer that captured an older value is stale and
   *  must stop reading — the segments arriving now belong to someone else. */
  get gen(): number {
    return this.generation;
  }

  /** A new utterance has started: drop buffered segments and release any
   *  pending `get`, so an in-flight consumer cannot eat the new segments. */
  reset(): void {
    this.items = [];
    this.generation += 1;
    const w = this.waiter;
    if (w) {
      this.waiter = null;
      clearTimeout(w.timer);
      w.resolve(null);
    }
  }

  put(item: string): void {
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      clearTimeout(w.timer);
      w.resolve(item);
      return;
    }
    this.items.push(item);
  }

  get(timeoutMs: number): Promise<string | null> {
    const buffered = this.items.shift();
    if (buffered !== undefined) return Promise.resolve(buffered);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        resolve(null);
      }, timeoutMs);
      this.waiter = { resolve, timer };
    });
  }

  drainNow(): string[] {
    const out = this.items;
    this.items = [];
    return out;
  }
}

// ── Streaming STT ───────────────────────────────────────────────────────────

export interface SttStreamCallbacks {
  onTranscript?: (text: string) => void;
}

export class SttStreamSession {
  readonly sampleRate = STT_SAMPLE_RATE;

  private ws: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private readonly queue = new SignalQueue();
  private outbound: string[] = [];
  private closed = false;
  private readonly url: string;

  constructor(
    language: string,
    private readonly callbacks: SttStreamCallbacks = {},
  ) {
    const qs = new URLSearchParams({
      model: env.SARVAM_STT_MODEL,
      "language-code": language,
      sample_rate: String(STT_SAMPLE_RATE),
      input_audio_codec: "pcm_s16le",
      vad_signals: "true",
    }).toString();
    this.url = `${wsUrl("/speech-to-text/ws")}?${qs}`;
  }

  /** Open the socket ahead of the first frame so the handshake is off the
   *  critical path. Best-effort — a failed prewarm reconnects on the next frame. */
  async prewarm(): Promise<void> {
    try {
      await this.ensureConnected();
    } catch {
      this.ws = null;
    }
  }

  private ensureConnected(): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connecting = this.connect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url, { headers: { "Api-Subscription-Key": env.SARVAM_API_KEY } });
      ws.on("open", () => {
        this.ws = ws;
        const pending = this.outbound;
        this.outbound = [];
        for (const frame of pending) {
          try {
            ws.send(frame);
          } catch {
            /* dropped — reconnect on next frame */
          }
        }
        resolve();
      });
      ws.on("message", (data) => this.handleMessage(rawToString(data)));
      ws.on("close", () => {
        if (this.ws === ws) this.ws = null;
      });
      ws.on("error", (err) => {
        if (this.ws === ws) this.ws = null;
        reject(err instanceof Error ? err : new Error("Sarvam STT socket error"));
      });
    });
  }

  private handleMessage(raw: string): void {
    let msg: { type?: string; data?: { transcript?: unknown } };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg?.type === "data") {
      const transcript = msg.data?.transcript;
      const text = (typeof transcript === "string" ? transcript : "").trim();
      if (text) {
        this.queue.put(text);
        this.callbacks.onTranscript?.(text);
      }
    }
  }

  /** Drop transcript segments from a previous utterance (call on speech start). */
  reset(): void {
    this.queue.reset();
  }

  /**
   * Forward one frame of 16 kHz mono signed-16-bit little-endian PCM, already
   * base64-encoded — which is how it arrives from the browser. Taking the
   * encoded string straight through saves a decode/re-encode per 32 ms frame,
   * per session, on a box that hosts several POCs.
   */
  sendPcmBase64(pcmBase64: string): void {
    if (this.closed) return;
    const frame = JSON.stringify({
      audio: {
        data: pcmBase64,
        sample_rate: String(this.sampleRate),
        encoding: "audio/wav",
      },
    });
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(frame);
      } catch {
        this.ws = null;
        this.outbound.push(frame);
        void this.ensureConnected();
      }
      return;
    }
    // Not open yet: buffer a bounded number of frames and (re)connect.
    if (this.outbound.length < 256) this.outbound.push(frame);
    void this.ensureConnected();
  }

  /**
   * Finalize the utterance and return the full transcript.
   *
   * Bails out if `reset()` lands mid-flush — that means the candidate re-opened
   * the mic while we were still waiting on Sarvam, and every segment from here
   * belongs to their *new* answer. Without the generation check this consumer
   * would swallow the opening words of that answer and the interviewer would
   * reply to a sentence with its beginning missing.
   */
  async flush(timeoutMs = 4000, graceMs = 50): Promise<string> {
    const gen = this.queue.gen;
    const parts: string[] = [...this.queue.drainNow()];
    const hadPreflush = parts.length > 0;

    await this.ensureConnected();
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "flush" }));
      } catch {
        this.ws = null;
      }
    }

    const first = await this.queue.get(timeoutMs);
    if (this.queue.gen !== gen) return "";
    if (first) parts.push(first);

    // Common single-segment utterance pays a 10 ms check; a multi-segment one
    // gets the full straggler grace.
    const tailGrace = hadPreflush ? graceMs : 10;
    while (true) {
      const next = await this.queue.get(tailGrace);
      if (this.queue.gen !== gen) return "";
      if (next === null) break;
      parts.push(next);
    }

    return parts.filter(Boolean).join(" ").trim();
  }

  close(): void {
    this.closed = true;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }
}

// ── Streaming TTS ───────────────────────────────────────────────────────────

export interface TtsStreamCallbacks {
  onAudio: (pcm: Uint8Array, sampleRate: number) => void;
}

export class TtsStreamSession {
  /** True while an utterance's audio is still pending (drives barge-in reset). */
  busy = false;
  readonly sampleRate: number;

  private ws: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private finalResolve: (() => void) | null = null;
  // Serializes message handling so audio callbacks and the trailing `final`
  // resolution complete in arrival order.
  private chain: Promise<void> = Promise.resolve();
  private readonly url: string;
  private readonly configFrame: string;
  private readonly onAudio: (pcm: Uint8Array, sampleRate: number) => void;

  constructor(language: string, callbacks: TtsStreamCallbacks) {
    this.sampleRate = env.SARVAM_TTS_SAMPLE_RATE;
    this.onAudio = callbacks.onAudio;
    this.url = `${wsUrl("/text-to-speech/ws")}?model=${encodeURIComponent(env.SARVAM_TTS_MODEL)}&send_completion_event=true`;
    this.configFrame = JSON.stringify({
      type: "config",
      data: {
        target_language_code: language,
        speaker: env.SARVAM_TTS_VOICE,
        model: env.SARVAM_TTS_MODEL,
        speech_sample_rate: String(this.sampleRate),
        output_audio_codec: "linear16",
        // 30 is Sarvam's minimum — anything lower is rejected with a 422
        // ("Input parameters has to be a valid dictionary"), verified by probe.
        // It is above SentenceChunker's 18-char `firstMin`, so the first
        // fragment does wait for a second one before synthesis starts; at
        // streaming speed that is tens of milliseconds. Don't "optimise" this
        // downward — it silences TTS completely.
        min_buffer_size: 30,
        max_chunk_length: 150,
      },
    });
  }

  async prewarm(): Promise<void> {
    try {
      await this.ensureConnected();
    } catch {
      this.ws = null;
    }
  }

  private ensureConnected(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connecting = this.connect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url, { headers: { "api-subscription-key": env.SARVAM_API_KEY } });
      ws.on("open", () => {
        this.ws = ws;
        this.chain = Promise.resolve();
        try {
          ws.send(this.configFrame);
          resolve();
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Sarvam TTS config send failed"));
        }
      });
      ws.on("message", (data) => {
        const raw = rawToString(data);
        this.chain = this.chain.then(() => this.handle(ws, raw)).catch(() => {});
      });
      ws.on("close", () => {
        if (this.ws === ws) this.ws = null;
      });
      ws.on("error", (err) => {
        if (this.ws === ws) this.ws = null;
        reject(err instanceof Error ? err : new Error("Sarvam TTS socket error"));
      });
    });
  }

  private handle(ws: WebSocket, raw: string): void {
    // A reset/dropped socket (barge-in) must not leak audio into the next turn.
    if (ws !== this.ws) return;
    let msg: { type?: string; data?: { audio?: unknown; event_type?: unknown } };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg?.type === "audio") {
      const b64 = msg.data?.audio;
      if (typeof b64 === "string" && b64) {
        this.onAudio(new Uint8Array(Buffer.from(b64, "base64")), this.sampleRate);
      }
    } else if (msg?.type === "event" && msg.data?.event_type === "final") {
      this.finalResolve?.();
    } else if (msg?.type === "error") {
      // Sarvam rejects a bad config with an error frame and then simply never
      // sends `final`, so this used to surface only as a 20s flush timeout and
      // a mute interviewer. Say so, and stop waiting.
      console.error(`[tts] Sarvam rejected the stream: ${raw.slice(0, 300)}`);
      this.finalResolve?.();
    }
  }

  /** Queue one sentence/clause for synthesis. */
  async speak(text: string): Promise<void> {
    await this.ensureConnected();
    this.busy = true;
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "text", data: { text } }));
      } catch {
        this.ws = null;
      }
    } else {
      this.ws = null;
    }
  }

  /** Force synthesis of buffered text, wait until all audio is delivered, then
   *  drop the socket (a flushed Sarvam stream is not reusable). */
  async flushAndWait(timeoutMs = 20000): Promise<void> {
    const ws = this.ws;
    if (!ws) {
      this.busy = false;
      return;
    }
    const final = new Promise<void>((resolve) => {
      this.finalResolve = resolve;
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });
    try {
      if (ws.readyState !== WebSocket.OPEN) throw new Error("closed");
      ws.send(JSON.stringify({ type: "flush" }));
      await Promise.race([final, timeout]);
    } catch {
      /* closed / timeout — fall through to teardown */
    } finally {
      if (timer) clearTimeout(timer);
      this.reset();
    }
  }

  /** Discard buffered/in-flight audio by dropping the socket (barge-in). */
  reset(): void {
    this.busy = false;
    this.finalResolve = null;
    const ws = this.ws;
    this.ws = null; // pending chain entries for `ws` now no-op (see handle)
    if (ws) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }

  close(): void {
    this.reset();
  }
}
