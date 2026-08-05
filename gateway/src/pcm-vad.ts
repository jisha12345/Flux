/**
 * Energy VAD for continuous 16 kHz PCM16LE mic audio.
 *
 * The browser streams frames whenever the mic is live; this detector converts
 * signal energy into the speech_start / audio / speech_end lifecycle consumed
 * by InterviewSession. Keeps a short pre-roll so the first consonant isn't lost
 * while confirming speech across several frames.
 *
 * Ported from rocketizer-mono packages/api/src/server/gateway/pcm-vad.ts.
 */

export interface PcmVadOptions {
  sampleRate?: number;
  /** Raw int16 RMS threshold (0..32768). */
  rmsThreshold: number;
  startFrames: number;
  silenceMs: number;
  preRollMs?: number;
}

export interface PcmVadCallbacks {
  onSpeechStart: () => void;
  onAudio: (pcm: Uint8Array) => void;
  onSpeechEnd: () => void;
}

interface BufferedFrame {
  pcm: Uint8Array;
  durationMs: number;
}

export function pcm16LeRms(pcm: Uint8Array): number {
  const sampleCount = Math.floor(pcm.byteLength / 2);
  if (sampleCount === 0) return 0;
  const view = new DataView(pcm.buffer, pcm.byteOffset, sampleCount * 2);
  let sumSquares = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const sample = view.getInt16(i * 2, true);
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / sampleCount);
}

export class PcmVoiceActivityDetector {
  private readonly sampleRate: number;
  private readonly preRollMs: number;
  private speaking = false;
  private loudFrames = 0;
  private trailingSilenceMs = 0;
  private preRollDurationMs = 0;
  private preRoll: BufferedFrame[] = [];

  constructor(
    private readonly options: PcmVadOptions,
    private readonly callbacks: PcmVadCallbacks,
  ) {
    this.sampleRate = options.sampleRate ?? 16_000;
    this.preRollMs = options.preRollMs ?? 160;
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  process(pcm: Uint8Array): void {
    const byteLength = pcm.byteLength - (pcm.byteLength % 2);
    if (byteLength === 0) return;
    const frame = byteLength === pcm.byteLength ? pcm : pcm.subarray(0, byteLength);
    const durationMs = (byteLength / 2 / this.sampleRate) * 1_000;
    const loud = pcm16LeRms(frame) >= this.options.rmsThreshold;

    if (this.speaking) {
      this.callbacks.onAudio(frame);
      this.trailingSilenceMs = loud ? 0 : this.trailingSilenceMs + durationMs;
      if (this.trailingSilenceMs >= this.options.silenceMs) {
        this.speaking = false;
        this.trailingSilenceMs = 0;
        this.loudFrames = 0;
        this.preRoll = [];
        this.preRollDurationMs = 0;
        this.callbacks.onSpeechEnd();
      }
      return;
    }

    this.bufferPreRoll(frame, durationMs);
    this.loudFrames = loud ? this.loudFrames + 1 : 0;
    if (this.loudFrames < this.options.startFrames) return;

    this.speaking = true;
    this.loudFrames = 0;
    this.trailingSilenceMs = 0;
    this.callbacks.onSpeechStart();
    for (const buffered of this.preRoll) this.callbacks.onAudio(buffered.pcm);
    this.preRoll = [];
    this.preRollDurationMs = 0;
  }

  reset(): void {
    this.speaking = false;
    this.loudFrames = 0;
    this.trailingSilenceMs = 0;
    this.preRoll = [];
    this.preRollDurationMs = 0;
  }

  private bufferPreRoll(pcm: Uint8Array, durationMs: number): void {
    // Own the bytes: WebSocket implementations may reuse their receive buffer.
    const owned = new Uint8Array(pcm);
    this.preRoll.push({ pcm: owned, durationMs });
    this.preRollDurationMs += durationMs;
    while (this.preRoll.length > 1 && this.preRollDurationMs > this.preRollMs) {
      const dropped = this.preRoll.shift();
      if (dropped) this.preRollDurationMs -= dropped.durationMs;
    }
  }
}
