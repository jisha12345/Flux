"use client";

/**
 * Browser half of the AI interview voice pipeline.
 *
 * Owns one WebSocket to the gateway, mic capture (16 kHz PCM16 via an
 * AudioWorklet), gapless scheduled PCM playback, and the recording mix
 * (mic + TTS) exposed as a MediaStream audio track for the MediaRecorder.
 *
 * The mic is push-to-talk: `openMic()` / `closeMic()` bracket the only window in
 * which audio frames leave the browser. The candidate's tap is the only thing
 * that *takes* the floor — the old automatic barge-in gate tripped on speaker
 * echo and cut the interviewer off mid-question. Releasing the floor is
 * automatic after ~1.5 s of trailing silence, which is safe for exactly that
 * reason: the mic is only open because they opened it, so the interviewer isn't
 * playing and there is no echo to mistake for speech. The tap still works as an
 * instant override.
 *
 * UI-visible bits are React state; the audio engine lives in refs — it
 * mutates per frame and must never trigger re-renders.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  IntegrityEventType,
  InterviewClientFrame,
  InterviewGatewayEvent,
} from "@/lib/interview-types";

export const GATEWAY_URL =
  process.env.NEXT_PUBLIC_INTERVIEW_GATEWAY_URL ?? "http://localhost:8787";

export type InterviewStreamStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "thinking"
  | "speaking"
  | "completed"
  | "error";

/** Interview metadata delivered by the gateway's `ready` event. */
export type InterviewMeta = Extract<
  InterviewGatewayEvent,
  { type: "ready" }
>["interview"];

export interface InterviewSection {
  id: string;
  title: string;
  index: number;
  total: number;
}

export interface InterviewTurn {
  role: "user" | "assistant";
  text: string;
}

export interface InterviewStreamApi {
  status: InterviewStreamStatus;
  meta: InterviewMeta | null;
  /** True while the candidate holds the floor (mic frames are being sent). */
  micOpen: boolean;
  /** True once the interviewer's audio has drained and it's the candidate's turn. */
  canSpeak: boolean;
  /** Transient coaching line, e.g. after a tap that captured no speech. */
  hint: string | null;
  /** Streaming interviewer caption — accumulated assistant deltas for the current turn. */
  caption: string;
  /** The candidate's own live transcript (latest partial or final utterance). */
  transcript: string;
  transcriptFinal: boolean;
  section: InterviewSection | null;
  turns: InterviewTurn[];
  error: string | null;
  /** Smoothed mic RMS, 0..1 — drives the level meter and the orb. */
  micLevel: number;
  /** 0..1 progress toward auto-send while the candidate is trailing off. */
  silenceProgress: number;
  /** Smoothed TTS playback RMS, 0..1 — modulates the speaking orb. */
  outputLevel: number;
  /** Acquire mic + build the capture/monitor graph. Safe to call repeatedly. */
  initMic: () => Promise<void>;
  /** Open the WebSocket (initialises the mic first if needed). */
  connect: () => Promise<void>;
  /** Take the floor — starts streaming mic audio. Interrupts the interviewer. */
  openMic: () => Promise<void>;
  /** Release the floor — the gateway transcribes and answers. */
  closeMic: () => void;
  start: () => void;
  repeat: () => void;
  end: () => void;
  sendText: (text: string) => void;
  reportIntegrity: (
    event: IntegrityEventType,
    occurredAt: Date,
    durationSeconds?: number
  ) => void;
  teardown: () => void;
  /** Mixed mic + TTS audio track for the interview recording. */
  getMixedAudioTrack: () => MediaStreamTrack | null;
  /** Shared AudioContext (also used for the speaker-check chime). */
  getAudioContext: () => AudioContext;
}

// ── Audio engine constants (ported from the reference voice pipeline) ────────

const PLAYBACK_LEAD = 0.02; // 20 ms safety margin before the first chunk
const WORKLET_URL = "/interview-worklet.js";
const WORKLET_NAME = "interview-capture-processor";
/** Only a fallback — every audio frame carries its own rate in the header. */
const DEFAULT_TTS_RATE = 16000;

// ── Auto end-of-turn ─────────────────────────────────────────────────────────
// Thresholds mirror the gateway's own speech-vs-mis-tap gate so both halves
// agree on what counts as someone talking.

/** Raw int16 RMS above which a 32 ms frame counts as speech. */
const VOICED_RMS = 500;
/** Frames of speech required before auto-send arms at all. */
const MIN_VOICED_FRAMES = 6;
/**
 * Frames (~32 ms each) of trailing silence that end the turn — about 1.5 s.
 *
 * This is the knob to tune against real candidates. Conversational turn-taking
 * would justify something nearer 1 s, but people think out loud mid-answer in
 * an interview and being cut off is far worse than waiting half a second
 * longer. Err long; the tap is always there for anyone who wants it sooner.
 */
const SILENCE_FRAMES_TO_END = 47;

// ── PCM helpers ──────────────────────────────────────────────────────────────

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** RMS of a raw PCM16LE capture frame, on the same int16 scale as the gateway. */
function int16Rms(buf: ArrayBuffer): number {
  const samples = new Int16Array(buf);
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) sumSquares += samples[i] * samples[i];
  return Math.sqrt(sumSquares / samples.length);
}

function analyserRms(
  analyser: AnalyserNode,
  scratch: Float32Array<ArrayBuffer>
): number {
  analyser.getFloatTimeDomainData(scratch);
  let sumSquares = 0;
  for (let i = 0; i < scratch.length; i++) sumSquares += scratch[i] * scratch[i];
  return Math.sqrt(sumSquares / scratch.length);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useInterviewStream(token: string): InterviewStreamApi {
  const [status, setStatus] = useState<InterviewStreamStatus>("idle");
  const [meta, setMeta] = useState<InterviewMeta | null>(null);
  const [caption, setCaption] = useState("");
  const [transcript, setTranscript] = useState("");
  const [transcriptFinal, setTranscriptFinal] = useState(false);
  const [section, setSection] = useState<InterviewSection | null>(null);
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [micOpen, setMicOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [silenceProgress, setSilenceProgress] = useState(0);

  // ── Audio engine (refs only — mutated per frame) ──
  const wsRef = useRef<WebSocket | null>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const sinkRef = useRef<GainNode | null>(null);
  const mediaDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const playbackGainRef = useRef<GainNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const outAnalyserRef = useRef<AnalyserNode | null>(null);
  const micReadyRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const micSmoothRef = useRef(0);
  const outSmoothRef = useRef(0);
  const micSetRef = useRef(-1);
  const outSetRef = useRef(-1);

  // Playback scheduling.
  const nextStartRef = useRef(0);
  const liveSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Auto end-of-turn bookkeeping (per-frame — refs, never state).
  const voicedFramesRef = useRef(0);
  const silentFramesRef = useRef(0);
  const silenceQRef = useRef(0);
  /** Set below; the capture worklet's callback is bound once at initMic. */
  const closeMicRef = useRef<() => void>(() => {});

  // Protocol state.
  const statusRef = useRef<InterviewStreamStatus>("idle");
  const micOpenRef = useRef(false);
  const captionRef = useRef("");
  const tornDownRef = useRef(false);
  /** Timer holding back a status the candidate shouldn't see yet (see below). */
  const deferredStatusRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDeferredStatus = useCallback(() => {
    if (deferredStatusRef.current !== null) {
      clearTimeout(deferredStatusRef.current);
      deferredStatusRef.current = null;
    }
  }, []);

  const setStatusAll = useCallback(
    (next: InterviewStreamStatus) => {
      clearDeferredStatus();
      statusRef.current = next;
      setStatus(next);
    },
    [clearDeferredStatus]
  );

  const getAudioContext = useCallback((): AudioContext => {
    let actx = actxRef.current;
    if (!actx || actx.state === "closed") {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      actx = new Ctor();
      actxRef.current = actx;
    }
    if (actx.state === "suspended") void actx.resume();
    return actx;
  }, []);

  /** Recording-mix graph: playbackGain → speakers + mediaDest + out analyser. */
  const ensureMixGraph = useCallback(
    (actx: AudioContext) => {
      if (!mediaDestRef.current) {
        mediaDestRef.current = actx.createMediaStreamDestination();
      }
      if (!playbackGainRef.current) {
        const gain = actx.createGain();
        gain.connect(actx.destination);
        gain.connect(mediaDestRef.current);
        const analyser = actx.createAnalyser();
        analyser.fftSize = 1024;
        gain.connect(analyser);
        outAnalyserRef.current = analyser;
        playbackGainRef.current = gain;
      }
      return playbackGainRef.current;
    },
    []
  );

  const stopPlayback = useCallback(() => {
    for (const src of liveSourcesRef.current) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    liveSourcesRef.current = [];
    nextStartRef.current = 0;
  }, []);

  /** Seconds of interviewer audio still queued to come out of the speakers. */
  const playbackRemaining = useCallback((): number => {
    const actx = actxRef.current;
    if (!actx || actx.state === "closed") return 0;
    return Math.max(0, nextStartRef.current - actx.currentTime);
  }, []);

  const playPcm = useCallback(
    (int16: Int16Array, sampleRate: number) => {
      if (int16.length === 0) return;
      const actx = getAudioContext();
      const gain = ensureMixGraph(actx);
      const buffer = actx.createBuffer(1, int16.length, sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < int16.length; i++) channel[i] = int16[i] / 32768;
      const src = actx.createBufferSource();
      src.buffer = buffer;
      src.connect(gain);
      const at = Math.max(actx.currentTime + PLAYBACK_LEAD, nextStartRef.current);
      src.start(at);
      nextStartRef.current = at + buffer.duration;
      liveSourcesRef.current.push(src);
      src.onended = () => {
        liveSourcesRef.current = liveSourcesRef.current.filter((s) => s !== src);
      };
    },
    [ensureMixGraph, getAudioContext]
  );

  /**
   * Interviewer audio arrives as a binary frame — an 8-byte header
   * ([uint32 seq][uint32 sampleRate]) followed by raw PCM16LE. It used to be
   * base64 inside a JSON event, which cost a third more bytes on the heaviest
   * stream on the socket plus a decode per chunk on the main thread.
   */
  const playAudioFrame = useCallback(
    (frame: ArrayBuffer) => {
      // Frames already in flight when the candidate took the floor.
      if (micOpenRef.current || frame.byteLength <= 8) return;
      const sampleRate = new DataView(frame).getUint32(4, true) || DEFAULT_TTS_RATE;
      // The header is 8 bytes, so the PCM view is 2-byte aligned.
      playPcm(new Int16Array(frame, 8, (frame.byteLength - 8) >> 1), sampleRate);
    },
    [playPcm]
  );

  const sendFrame = useCallback((frame: InterviewClientFrame) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
  }, []);

  /** Flush the accumulated interviewer caption into the turn log. */
  const flushCaption = useCallback(() => {
    const text = captionRef.current.trim();
    captionRef.current = "";
    setCaption("");
    if (text) setTurns((t) => [...t, { role: "assistant", text }]);
  }, []);

  const resetTurnDetector = useCallback(() => {
    voicedFramesRef.current = 0;
    silentFramesRef.current = 0;
    if (silenceQRef.current !== 0) {
      silenceQRef.current = 0;
      setSilenceProgress(0);
    }
  }, []);

  // ── Mic frame routing: strictly push-to-talk ──
  // The worklet runs continuously (it also feeds the level meter and the
  // recording mix), but a frame only leaves the browser while the candidate is
  // holding the floor. Room noise between turns is therefore never heard.
  const emitFrame = useCallback(
    (buf: ArrayBuffer) => {
      if (!micOpenRef.current) return;
      sendFrame({ type: "audio", data: bufferToBase64(buf) });

      // Auto end-of-turn. Waiting for the candidate to tap "send" costs a full
      // human reaction time on every single turn — invisible in any latency
      // measurement, and the largest per-turn delay left in the pipeline.
      // Arms only once they have actually said something, so an open mic in a
      // silent room waits for the tap instead of firing an empty turn.
      if (int16Rms(buf) >= VOICED_RMS) {
        voicedFramesRef.current += 1;
        if (silentFramesRef.current > 0) {
          silentFramesRef.current = 0;
          if (silenceQRef.current !== 0) {
            silenceQRef.current = 0;
            setSilenceProgress(0);
          }
        }
        return;
      }
      if (voicedFramesRef.current < MIN_VOICED_FRAMES) return;

      silentFramesRef.current += 1;
      // Quantised: the ring repaints ~10 times over the countdown, not 38.
      const progress = Math.min(
        1,
        Math.round((silentFramesRef.current / SILENCE_FRAMES_TO_END) * 10) / 10
      );
      if (progress !== silenceQRef.current) {
        silenceQRef.current = progress;
        setSilenceProgress(progress);
      }
      if (silentFramesRef.current >= SILENCE_FRAMES_TO_END) closeMicRef.current();
    },
    [sendFrame]
  );

  // ── Level meters (rAF, quantised so renders only happen on visible change) ──
  const startLevelLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    const scratch = new Float32Array(1024);
    const tick = () => {
      const micA = micAnalyserRef.current;
      if (micA) {
        const rms = analyserRms(micA, scratch);
        micSmoothRef.current = Math.max(rms, micSmoothRef.current * 0.86);
        const q = Math.round(Math.min(1, micSmoothRef.current) * 100) / 100;
        if (q !== micSetRef.current) {
          micSetRef.current = q;
          setMicLevel(q);
        }
      }
      const outA = outAnalyserRef.current;
      if (outA) {
        const rms = analyserRms(outA, scratch);
        outSmoothRef.current = Math.max(rms, outSmoothRef.current * 0.86);
        const q = Math.round(Math.min(1, outSmoothRef.current) * 100) / 100;
        if (q !== outSetRef.current) {
          outSetRef.current = q;
          setOutputLevel(q);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Mic init: capture graph + analyser + recording mix ──
  const initMic = useCallback(async () => {
    if (micReadyRef.current) return;
    micReadyRef.current = true; // guard against concurrent calls
    try {
      const actx = getAudioContext();
      ensureMixGraph(actx);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      micStreamRef.current = stream;
      const source = actx.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Level meter.
      const analyser = actx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      micAnalyserRef.current = analyser;

      // Recorder hears the candidate directly (not through the speakers).
      if (mediaDestRef.current) source.connect(mediaDestRef.current);

      // Capture worklet → muted sink keeps it in the render graph w/o echo.
      await actx.audioWorklet.addModule(WORKLET_URL);
      const worklet = new AudioWorkletNode(actx, WORKLET_NAME);
      worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        emitFrame(event.data);
      };
      const sink = actx.createGain();
      sink.gain.value = 0;
      source.connect(worklet);
      worklet.connect(sink);
      sink.connect(actx.destination);
      workletRef.current = worklet;
      sinkRef.current = sink;

      startLevelLoop();
    } catch (err) {
      micReadyRef.current = false;
      for (const track of micStreamRef.current?.getTracks() ?? []) track.stop();
      micStreamRef.current = null;
      throw err;
    }
  }, [emitFrame, ensureMixGraph, getAudioContext, startLevelLoop]);

  // ── Gateway event handling ──
  const handleEvent = useCallback(
    (ev: InterviewGatewayEvent) => {
      switch (ev.type) {
        case "ready":
          setMeta(ev.interview);
          setStatusAll("ready");
          return;
        case "status": {
          if (statusRef.current === "completed") return;
          // A new interviewer turn begins — bank the previous caption.
          if (ev.data === "thinking") flushCaption();
          // The gateway calls it "listening" the moment it stops *sending*
          // audio, but seconds of the question can still be queued for the
          // speakers. Handing the candidate the mic over the tail end of a
          // question is exactly the glitch we're removing, so hold the
          // invitation back until playback has actually drained.
          if (ev.data === "listening" && !micOpenRef.current) {
            const remaining = playbackRemaining();
            if (remaining > 0.05) {
              clearDeferredStatus();
              deferredStatusRef.current = setTimeout(
                () => {
                  deferredStatusRef.current = null;
                  if (tornDownRef.current) return;
                  statusRef.current = "listening";
                  setStatus("listening");
                },
                Math.round(remaining * 1000) + 120
              );
              return;
            }
          }
          setStatusAll(ev.data);
          return;
        }
        case "transcript":
          // Candidate is talking — the previous interviewer caption is done.
          if (captionRef.current) flushCaption();
          setHint(null);
          setTranscript(ev.text);
          setTranscriptFinal(ev.final);
          if (ev.final && ev.text.trim()) {
            setTurns((t) => [...t, { role: "user", text: ev.text.trim() }]);
          }
          return;
        case "assistant_delta":
          if (ev.text) {
            captionRef.current += ev.text;
            setCaption(captionRef.current);
          }
          return;
        case "assistant_text":
          // Authoritative full turn text — replaces any accumulated deltas.
          if (ev.text) {
            captionRef.current = ev.text;
            setCaption(ev.text);
          }
          return;
        case "audio_done":
          return;
        case "interrupted":
          stopPlayback();
          return;
        case "no_speech":
          setHint("I didn't catch that. Tap Speak and give it another go.");
          return;
        case "section":
          setSection({ id: ev.id, title: ev.title, index: ev.index, total: ev.total });
          return;
        case "completed":
          flushCaption();
          micOpenRef.current = false;
          setMicOpen(false);
          setHint(null);
          // The gateway has finished *sending* the closing audio, but the
          // browser may still have seconds scheduled for playback. Completing
          // now starts recorder finalization and clips the thank-you mid-word.
          // Hold completion until the local playback queue has drained.
          const remaining = playbackRemaining();
          if (remaining > 0.05) {
            clearDeferredStatus();
            deferredStatusRef.current = setTimeout(() => {
              deferredStatusRef.current = null;
              if (tornDownRef.current) return;
              statusRef.current = "completed";
              setStatus("completed");
            }, Math.round(remaining * 1000) + 180);
            return;
          }
          setStatusAll("completed");
          return;
        case "error":
          setError(ev.message || "Something went wrong on the interview server.");
          return;
        default:
          return;
      }
    },
    [
      clearDeferredStatus,
      flushCaption,
      playbackRemaining,
      setStatusAll,
      stopPlayback,
    ]
  );

  // ── Connection ──
  const connect = useCallback(async () => {
    const existing = wsRef.current;
    if (
      existing &&
      (existing.readyState === WebSocket.OPEN ||
        existing.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    tornDownRef.current = false;
    setError(null);
    setStatusAll("connecting");

    try {
      await initMic();
    } catch {
      setError(
        "We couldn't access your microphone. Please allow microphone access in your browser and try again."
      );
      setStatusAll("error");
      return;
    }

    const wsUrl = `${GATEWAY_URL.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onmessage = (event) => {
      if (wsRef.current !== ws || tornDownRef.current) return;
      if (event.data instanceof ArrayBuffer) {
        playAudioFrame(event.data);
        return;
      }
      if (typeof event.data !== "string") return;
      let parsed: InterviewGatewayEvent;
      try {
        parsed = JSON.parse(event.data) as InterviewGatewayEvent;
      } catch {
        return;
      }
      handleEvent(parsed);
    };
    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      micOpenRef.current = false;
      setMicOpen(false);
      if (tornDownRef.current) return;
      const st = statusRef.current;
      if (st === "completed" || st === "idle") return;
      setError(
        "The connection to your interview dropped. Check your internet connection and reconnect. Your progress is saved."
      );
      setStatusAll("error");
    };
    ws.onerror = () => {
      // onclose always follows and carries the user-facing handling.
    };
  }, [handleEvent, initMic, playAudioFrame, setStatusAll, token]);

  // ── Actions ──

  /** Take the floor. Tapping during a question is a deliberate interruption. */
  const openMic = useCallback(async () => {
    if (micOpenRef.current || statusRef.current === "completed") return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      await initMic();
    } catch {
      setError(
        "We couldn't access your microphone. Please allow microphone access in your browser and try again."
      );
      return;
    }
    // The tap is a user gesture — a good moment to un-suspend audio on iOS.
    getAudioContext();
    stopPlayback(); // the candidate is talking now; cut the interviewer short
    setHint(null);
    setTranscript("");
    setTranscriptFinal(false);
    resetTurnDetector();
    micOpenRef.current = true;
    setMicOpen(true);
    setStatusAll("listening");
    sendFrame({ type: "mic_open" });
  }, [
    getAudioContext,
    initMic,
    resetTurnDetector,
    sendFrame,
    setStatusAll,
    stopPlayback,
  ]);

  /** Release the floor — the gateway transcribes what it heard and replies. */
  const closeMic = useCallback(() => {
    if (!micOpenRef.current) return;
    micOpenRef.current = false;
    setMicOpen(false);
    resetTurnDetector();
    sendFrame({ type: "mic_close" });
  }, [resetTurnDetector, sendFrame]);

  // The capture worklet's message handler is bound once, at initMic. Auto
  // end-of-turn reaches the *current* closeMic through this ref rather than
  // whichever closure happened to be live when the graph was built.
  closeMicRef.current = closeMic;

  const start = useCallback(() => sendFrame({ type: "start" }), [sendFrame]);

  const repeat = useCallback(() => {
    if (micOpenRef.current) return; // don't talk over the candidate
    // The question will re-stream from scratch — reset the caption.
    captionRef.current = "";
    setCaption("");
    setHint(null);
    sendFrame({ type: "repeat" });
  }, [sendFrame]);

  const end = useCallback(() => {
    closeMic();
    sendFrame({ type: "end" });
  }, [closeMic, sendFrame]);

  const sendText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed) sendFrame({ type: "text", data: trimmed });
    },
    [sendFrame]
  );

  const reportIntegrity = useCallback(
    (event: IntegrityEventType, occurredAt: Date, durationSeconds = 0) => {
      sendFrame({
        type: "integrity",
        event,
        occurred_at: occurredAt.toISOString(),
        duration_seconds: Math.max(0, Math.round(durationSeconds)),
      });
    },
    [sendFrame]
  );

  const getMixedAudioTrack = useCallback((): MediaStreamTrack | null => {
    return mediaDestRef.current?.stream.getAudioTracks()[0] ?? null;
  }, []);

  const teardown = useCallback(() => {
    tornDownRef.current = true;
    clearDeferredStatus();
    micOpenRef.current = false;
    setMicOpen(false);
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    stopPlayback();
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    workletRef.current?.disconnect();
    sourceRef.current?.disconnect();
    sinkRef.current?.disconnect();
    playbackGainRef.current?.disconnect();
    workletRef.current = null;
    sourceRef.current = null;
    sinkRef.current = null;
    playbackGainRef.current = null;
    micAnalyserRef.current = null;
    outAnalyserRef.current = null;
    mediaDestRef.current = null;
    for (const track of micStreamRef.current?.getTracks() ?? []) track.stop();
    micStreamRef.current = null;
    micReadyRef.current = false;
    const actx = actxRef.current;
    actxRef.current = null;
    if (actx && actx.state !== "closed") void actx.close();
  }, [clearDeferredStatus, stopPlayback]);

  // Tear everything down if the component using the hook unmounts.
  const teardownRef = useRef(teardown);
  teardownRef.current = teardown;
  useEffect(() => {
    return () => teardownRef.current();
  }, []);

  return {
    status,
    meta,
    micOpen,
    // "thinking" counts: openMic cancels the in-flight turn cleanly, so leaving
    // the button dead while the model generates only made the UI feel stuck.
    canSpeak:
      status === "listening" || status === "speaking" || status === "thinking",
    hint,
    caption,
    transcript,
    transcriptFinal,
    section,
    turns,
    error,
    micLevel,
    silenceProgress,
    outputLevel,
    initMic,
    connect,
    openMic,
    closeMic,
    start,
    repeat,
    end,
    sendText,
    reportIntegrity,
    teardown,
    getMixedAudioTrack,
    getAudioContext,
  };
}
