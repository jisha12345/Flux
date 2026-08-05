"use client";

/**
 * Browser half of the AI interview voice pipeline.
 *
 * Owns one WebSocket to the gateway, mic capture (16 kHz PCM16 via an
 * AudioWorklet), gapless scheduled PCM playback, the RMS barge-in gate that
 * rejects speaker echo while the interviewer is talking, and the recording
 * mix (mic + TTS) exposed as a MediaStream audio track for the MediaRecorder.
 *
 * UI-visible bits are React state; the audio engine lives in refs — it
 * mutates per frame and must never trigger re-renders.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
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
  /** Smoothed TTS playback RMS, 0..1 — modulates the speaking orb. */
  outputLevel: number;
  /** Acquire mic + build the capture/monitor graph. Safe to call repeatedly. */
  initMic: () => Promise<void>;
  /** Open the WebSocket (initialises the mic first if needed). */
  connect: () => Promise<void>;
  start: () => void;
  repeat: () => void;
  end: () => void;
  sendText: (text: string) => void;
  teardown: () => void;
  /** Mixed mic + TTS audio track for the interview recording. */
  getMixedAudioTrack: () => MediaStreamTrack | null;
  /** Shared AudioContext (also used for the speaker-check chime). */
  getAudioContext: () => AudioContext;
}

// ── Audio engine constants (ported from the reference voice pipeline) ────────

const PLAYBACK_LEAD = 0.02; // 20 ms safety margin before the first chunk
/** RMS threshold while the interviewer is speaking — begins a barge-in. */
const OPEN_BARGE_RMS = 0.09;
const OPEN_BARGE_FRAMES = 4; // ~128 ms: reject brief speaker echo, keep natural interruption
const OPEN_BARGE_PRE_FRAMES = 6; // preserve ~190 ms of the candidate's speech onset
const WORKLET_URL = "/interview-worklet.js";
const WORKLET_NAME = "interview-capture-processor";
const DEFAULT_TTS_RATE = 22050;

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

function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // Guard against an odd byte length (drop the trailing byte rather than throw).
  const evenLength = bytes.byteLength - (bytes.byteLength % 2);
  return new Int16Array(bytes.buffer, 0, evenLength / 2);
}

function pcm16Rms(buf: ArrayBuffer): number {
  const samples = new Int16Array(buf);
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    const n = samples[i] / 32768;
    sumSquares += n * n;
  }
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

  // Protocol state.
  const statusRef = useRef<InterviewStreamStatus>("idle");
  const suppressAudioRef = useRef(false);
  const bargeFramesRef = useRef(0);
  const bargePreBufRef = useRef<string[]>([]);
  const captionRef = useRef("");
  const tornDownRef = useRef(false);

  const setStatusAll = useCallback((next: InterviewStreamStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

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

  // ── Mic frame routing: the open-mic barge-in gate ──
  const emitFrame = useCallback(
    (buf: ArrayBuffer) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const st = statusRef.current;

      // While the interviewer is speaking, hold mic frames locally. Only after
      // sustained energy (a real human interruption, not speaker echo) do we
      // barge in — then replay the onset buffer so the first word isn't lost.
      if (st === "speaking" && !suppressAudioRef.current) {
        const frame = bufferToBase64(buf);
        const pre = bargePreBufRef.current;
        pre.push(frame);
        if (pre.length > OPEN_BARGE_PRE_FRAMES) pre.shift();
        if (pcm16Rms(buf) >= OPEN_BARGE_RMS) {
          bargeFramesRef.current += 1;
          if (bargeFramesRef.current >= OPEN_BARGE_FRAMES) {
            const onset = pre.splice(0);
            sendFrame({ type: "barge_in" });
            stopPlayback();
            suppressAudioRef.current = true;
            bargeFramesRef.current = 0;
            for (const onsetFrame of onset) {
              sendFrame({ type: "audio", data: onsetFrame });
            }
          }
        } else {
          bargeFramesRef.current = 0;
        }
        return;
      }

      bargePreBufRef.current = [];
      // 'speaking' here means post-barge (suppressed) — keep streaming speech.
      if (st === "listening" || st === "thinking" || st === "speaking") {
        sendFrame({ type: "audio", data: bufferToBase64(buf) });
      }
    },
    [sendFrame, stopPlayback]
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
        case "status":
          if (statusRef.current === "completed") return;
          if (ev.data !== "speaking") {
            bargeFramesRef.current = 0;
            bargePreBufRef.current = [];
            suppressAudioRef.current = false;
          }
          // A new interviewer turn begins — bank the previous caption.
          if (ev.data === "thinking") flushCaption();
          setStatusAll(ev.data);
          return;
        case "transcript":
          // Candidate is talking — the previous interviewer caption is done.
          if (captionRef.current) flushCaption();
          setTranscript(ev.text);
          setTranscriptFinal(ev.final);
          if (ev.final) {
            suppressAudioRef.current = false;
            if (ev.text.trim()) {
              setTurns((t) => [...t, { role: "user", text: ev.text.trim() }]);
            }
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
        case "audio":
          if (suppressAudioRef.current) return;
          if (ev.data) {
            playPcm(
              base64ToInt16(ev.data),
              typeof ev.sample_rate === "number" ? ev.sample_rate : DEFAULT_TTS_RATE
            );
          }
          return;
        case "audio_done":
          return;
        case "interrupted":
          stopPlayback();
          bargeFramesRef.current = 0;
          return;
        case "section":
          setSection({ id: ev.id, title: ev.title, index: ev.index, total: ev.total });
          return;
        case "completed":
          flushCaption();
          suppressAudioRef.current = false;
          setStatusAll("completed");
          return;
        case "error":
          setError(ev.message || "Something went wrong on the interview server.");
          return;
        default:
          return;
      }
    },
    [flushCaption, playPcm, setStatusAll, stopPlayback]
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
    wsRef.current = ws;

    ws.onmessage = (event) => {
      if (wsRef.current !== ws || tornDownRef.current) return;
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
      if (tornDownRef.current) return;
      const st = statusRef.current;
      if (st === "completed" || st === "idle") return;
      setError(
        "The connection to your interview dropped. Check your internet connection and reconnect — your progress is saved."
      );
      setStatusAll("error");
    };
    ws.onerror = () => {
      // onclose always follows and carries the user-facing handling.
    };
  }, [handleEvent, initMic, setStatusAll, token]);

  // ── Actions ──
  const start = useCallback(() => sendFrame({ type: "start" }), [sendFrame]);

  const repeat = useCallback(() => {
    // The question will re-stream from scratch — reset the caption.
    captionRef.current = "";
    setCaption("");
    sendFrame({ type: "repeat" });
  }, [sendFrame]);

  const end = useCallback(() => sendFrame({ type: "end" }), [sendFrame]);

  const sendText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed) sendFrame({ type: "text", data: trimmed });
    },
    [sendFrame]
  );

  const getMixedAudioTrack = useCallback((): MediaStreamTrack | null => {
    return mediaDestRef.current?.stream.getAudioTracks()[0] ?? null;
  }, []);

  const teardown = useCallback(() => {
    tornDownRef.current = true;
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
    bargeFramesRef.current = 0;
    bargePreBufRef.current = [];
    suppressAudioRef.current = false;
    const actx = actxRef.current;
    actxRef.current = null;
    if (actx && actx.state !== "closed") void actx.close();
  }, [stopPlayback]);

  // Tear everything down if the component using the hook unmounts.
  const teardownRef = useRef(teardown);
  teardownRef.current = teardown;
  useEffect(() => {
    return () => teardownRef.current();
  }, []);

  return {
    status,
    meta,
    caption,
    transcript,
    transcriptFinal,
    section,
    turns,
    error,
    micLevel,
    outputLevel,
    initMic,
    connect,
    start,
    repeat,
    end,
    sendText,
    teardown,
    getMixedAudioTrack,
    getAudioContext,
  };
}
