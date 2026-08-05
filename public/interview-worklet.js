/**
 * Mic capture worklet for the AI interview voice pipeline.
 *
 * Downsamples the mic (usually 48 kHz) to 16 kHz mono and posts Int16 little-
 * endian PCM frames (512 samples ≈ 32 ms each) back to the main thread, which
 * base64-encodes and ships them over the interview WebSocket. Linear
 * interpolation is plenty for speech-to-text and keeps the worklet cheap.
 */
class InterviewCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.ratio = sampleRate / this.targetRate; // input samples per output sample
    this.acc = []; // buffered input floats awaiting resample
    this.pos = 0; // fractional read cursor into acc
    this.frame = 512; // 32 ms at 16 kHz
    this.out = new Float32Array(this.frame);
    this.outLen = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) this.acc.push(channel[i]);

    while (this.pos + 1 < this.acc.length) {
      const idx = Math.floor(this.pos);
      const frac = this.pos - idx;
      this.out[this.outLen++] = this.acc[idx] * (1 - frac) + this.acc[idx + 1] * frac;
      if (this.outLen === this.frame) this.flush();
      this.pos += this.ratio;
    }

    const consumed = Math.floor(this.pos);
    if (consumed > 0) {
      this.acc.splice(0, consumed);
      this.pos -= consumed;
    }
    return true;
  }

  flush() {
    const pcm = new Int16Array(this.outLen);
    for (let i = 0; i < this.outLen; i++) {
      const v = Math.max(-1, Math.min(1, this.out[i]));
      pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    this.outLen = 0;
  }
}

registerProcessor('interview-capture-processor', InterviewCaptureProcessor);
