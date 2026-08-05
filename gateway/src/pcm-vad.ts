/**
 * Signal-energy helper for 16 kHz PCM16LE mic audio.
 *
 * This file used to host an energy VAD that turned the continuous mic stream
 * into speech_start / speech_end events. The interview is push-to-talk now — the
 * candidate's tap defines the turn boundaries — so all that survives is the RMS
 * measure, which the session uses only to tell "they spoke" from "they tapped by
 * accident" before paying for an STT flush.
 */

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
