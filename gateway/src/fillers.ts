/**
 * Pre-synthesized acknowledgement clips ("Got it.", "Right.") that cover the
 * dead air between the candidate sending an answer and the interviewer's first
 * real audio.
 *
 * That gap is irreducible — STT has to finalize, then the model has to start
 * generating, then TTS has to return its first chunk. A human interviewer fills
 * it with a backchannel rather than silence, so we do too. Clips are
 * synthesized once per session and replayed from memory, so playing one costs
 * a socket write and nothing else.
 *
 * The interviewer prompt is told not to open with a generic acknowledgement,
 * because this bank already said it.
 */
import { TtsStreamSession } from "./audio-stream.js";
import { env } from "./env.js";

/** Deliberately content-free: these play before anything has been transcribed,
 *  so they must be safe after *any* answer. */
const LINES: Record<string, string[]> = {
  "en-IN": ["Got it.", "Right.", "Okay.", "Mm-hmm.", "Sure.", "Understood."],
  "hi-IN": ["ठीक है।", "जी।", "अच्छा।", "समझ गई।", "हाँ।"],
};

function linesFor(language: string): string[] {
  return LINES[language] ?? LINES["en-IN"];
}

export class FillerBank {
  readonly sampleRate = env.SARVAM_TTS_SAMPLE_RATE;

  private clips: Uint8Array[] = [];
  private lastIndex = -1;
  private warming: Promise<void> | null = null;

  constructor(private readonly language: string) {}

  get ready(): boolean {
    return this.clips.length > 0;
  }

  /** Synthesize the bank once. Best-effort — a failure just means silent gaps. */
  warm(): Promise<void> {
    if (this.warming) return this.warming;
    this.warming = this.synthesizeAll().catch((err) => {
      console.error("[fillers] warm failed — turns will start silent:", err);
    });
    return this.warming;
  }

  private async synthesizeAll(): Promise<void> {
    const startedAt = Date.now();
    for (const line of linesFor(this.language)) {
      const clip = await this.synthesize(line);
      if (clip) this.clips.push(clip);
    }
    console.log(
      `[fillers] ${this.clips.length} clip(s) ready in ${Date.now() - startedAt}ms`,
    );
  }

  /** One socket per clip — a flushed Sarvam TTS stream cannot be reused. */
  private async synthesize(line: string): Promise<Uint8Array | null> {
    const parts: Buffer[] = [];
    const tts = new TtsStreamSession(this.language, {
      onAudio: (pcm) => {
        parts.push(Buffer.from(pcm));
      },
    });
    try {
      await tts.speak(line);
      await tts.flushAndWait(10_000);
    } catch {
      tts.close();
      return null;
    }
    return parts.length > 0 ? Buffer.concat(parts) : null;
  }

  /** The next clip — never the one played last, so it doesn't sound canned. */
  next(): Uint8Array | null {
    if (this.clips.length === 0) return null;
    if (this.clips.length === 1) return this.clips[0];
    let index = this.lastIndex;
    while (index === this.lastIndex) {
      index = Math.floor(Math.random() * this.clips.length);
    }
    this.lastIndex = index;
    return this.clips[index];
  }
}
