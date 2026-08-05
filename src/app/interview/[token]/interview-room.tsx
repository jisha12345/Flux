"use client";

/**
 * Step 4 — the live interview room.
 *
 * Connects the voice stream, records camera + mixed audio (mic + TTS) via
 * MediaRecorder with 10s chunk uploads to the gateway, and renders the orb,
 * streaming captions, section progress, and controls.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Loader2,
  Mic,
  PhoneOff,
  RefreshCw,
  Repeat,
  Send,
  X,
} from "lucide-react";
import { InterviewerOrb, orbStatusWord } from "./orb";
import {
  GATEWAY_URL,
  type InterviewStreamApi,
} from "./use-interview-stream";
import { GhostButton, cx } from "./ui";

const LIVE_STATUSES = new Set(["listening", "thinking", "speaking"]);

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function InterviewRoom({
  token,
  cameraStream,
  stream,
  onFinished,
}: {
  token: string;
  cameraStream: MediaStream | null;
  stream: InterviewStreamApi;
  onFinished: () => void;
}) {
  const {
    status,
    meta,
    micOpen,
    canSpeak,
    hint,
    caption,
    transcript,
    section,
    error,
    micLevel,
    outputLevel,
    connect,
    openMic,
    closeMic,
    start,
    repeat,
    end,
    sendText,
    getMixedAudioTrack,
  } = stream;

  const pipRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  const startedRef = useRef(false);
  const finishingRef = useRef(false);
  const endFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const [elapsed, setElapsed] = useState(0);
  const [answerSeconds, setAnswerSeconds] = useState(0);
  const [recording, setRecording] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [devText, setDevText] = useState("");

  const live = LIVE_STATUSES.has(status);

  // ── PiP video ──
  useEffect(() => {
    if (pipRef.current && cameraStream) {
      pipRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  // ── Dev text input (hands-free fallback for local development) ──
  useEffect(() => {
    try {
      setDevMode(window.localStorage.getItem("interview_dev") !== null);
    } catch {
      /* storage unavailable */
    }
  }, []);

  // ── Connect on mount ──
  useEffect(() => {
    void connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Chunk uploads: strictly serialized — the gateway appends raw bodies ──
  const queueChunk = useCallback(
    (blob: Blob) => {
      uploadChainRef.current = uploadChainRef.current.then(() =>
        fetch(`${GATEWAY_URL}/upload/${token}/chunk`, {
          method: "POST",
          headers: { "content-type": "video/webm" },
          body: blob,
        })
          .then(() => undefined)
          .catch(() => undefined)
      );
    },
    [token]
  );

  const startRecording = useCallback(() => {
    if (recorderRef.current) return;
    const tracks: MediaStreamTrack[] = [];
    const videoTrack = cameraStream?.getVideoTracks()[0];
    if (videoTrack) tracks.push(videoTrack);
    const audioTrack = getMixedAudioTrack();
    if (audioTrack) tracks.push(audioTrack);
    if (tracks.length === 0) return;
    try {
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";
      const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType });
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) queueChunk(event.data);
      };
      recorder.start(10000);
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      // Recording is best-effort — the interview itself continues.
    }
  }, [cameraStream, getMixedAudioTrack, queueChunk]);

  // ── Finish: stop recorder → flush chunks → finalize → done screen ──
  const finish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    if (endFallbackRef.current) {
      clearTimeout(endFallbackRef.current);
      endFallbackRef.current = null;
    }
    setFinalizing(true);
    // Small grace so the interviewer's sign-off isn't clipped from the tape.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        try {
          recorder.stop(); // fires a final ondataavailable first
        } catch {
          resolve();
        }
      });
    }
    setRecording(false);
    await uploadChainRef.current;
    try {
      await fetch(`${GATEWAY_URL}/upload/${token}/finalize`, { method: "POST" });
    } catch {
      /* recording finalize is best-effort */
    }
    onFinished();
  }, [onFinished, token]);

  // ── Ready → start recording, then tell the gateway to begin ──
  useEffect(() => {
    if (status !== "ready") return;
    if (!startedRef.current) {
      startedRef.current = true;
      startRecording(); // recorder first, so the greeting is captured
      start();
      startTimeRef.current = Date.now();
    } else {
      // Reconnect path: the gateway re-sent `ready` — resume the session.
      start();
    }
  }, [status, start, startRecording]);

  // ── Completed → wrap up ──
  useEffect(() => {
    if (status === "completed") void finish();
  }, [status, finish]);

  // ── Elapsed timer ──
  useEffect(() => {
    const id = setInterval(() => {
      if (startTimeRef.current !== null) {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Push-to-talk ──
  const busy = ending || finalizing;
  const micDisabled = !micOpen && (!canSpeak || busy);

  const toggleMic = useCallback(() => {
    if (busy) return;
    if (micOpen) closeMic();
    else if (canSpeak) void openMic();
  }, [busy, canSpeak, closeMic, micOpen, openMic]);

  // Space is the keyboard equivalent of the tap. preventDefault also stops the
  // focused button from firing a second toggle on keyup.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      toggleMic();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleMic]);

  // Answer timer — reassures the candidate that they're actually being heard.
  useEffect(() => {
    if (!micOpen) {
      setAnswerSeconds(0);
      return;
    }
    const startedAt = Date.now();
    setAnswerSeconds(0);
    const id = setInterval(
      () => setAnswerSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      500
    );
    return () => clearInterval(id);
  }, [micOpen]);

  const handleEnd = useCallback(() => {
    setConfirmEnd(false);
    setEnding(true);
    end();
    // If the gateway's `completed` never arrives, don't strand the candidate.
    endFallbackRef.current = setTimeout(() => void finish(), 10000);
  }, [end, finish]);

  useEffect(() => {
    return () => {
      if (endFallbackRef.current) clearTimeout(endFallbackRef.current);
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  // ── Section rail ──
  const sections = meta?.sections ?? [];
  const currentIdx = section
    ? sections.findIndex((s) => s.id === section.id)
    : live
      ? 0
      : -1;

  const showError = error !== null && error !== dismissedError;
  const captionWords = caption ? caption.split(/\s+/).filter(Boolean) : [];

  return (
    <div className="flex min-h-[100dvh] w-full flex-col">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <div className="flex shrink-0 items-baseline gap-3">
          <span className="text-lg font-semibold tracking-tight text-emerald-400">
            Hyr
          </span>
          <span className="hidden text-xs text-zinc-400 sm:block">
            {meta?.role_title ?? "AI Interview"}
          </span>
        </div>

        {/* Section progress rail */}
        {sections.length > 0 && (
          <nav
            aria-label="Interview sections"
            className="hidden min-w-0 items-center gap-1 md:flex"
          >
            {sections.map((s, i) => {
              const done = currentIdx > i;
              const current = currentIdx === i;
              return (
                <div key={s.id} className="flex min-w-0 items-center gap-1">
                  {i > 0 && <span className="h-px w-4 shrink-0 bg-white/15" />}
                  <div
                    className={cx(
                      "flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors duration-300",
                      current && "bg-emerald-400/10"
                    )}
                  >
                    <span
                      className={cx(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] transition-colors duration-300",
                        done
                          ? "bg-emerald-400 text-[#06251a]"
                          : current
                            ? "border border-emerald-400 text-emerald-400"
                            : "border border-white/20 text-zinc-500"
                      )}
                    >
                      {done ? <Check className="h-2.5 w-2.5" strokeWidth={4} /> : i + 1}
                    </span>
                    <span
                      className={cx(
                        "truncate text-xs transition-colors duration-300",
                        current
                          ? "font-medium text-emerald-300"
                          : done
                            ? "text-zinc-400"
                            : "text-zinc-500"
                      )}
                    >
                      {s.title}
                    </span>
                  </div>
                </div>
              );
            })}
          </nav>
        )}

        <div className="flex shrink-0 items-center gap-3">
          {recording && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              REC
            </span>
          )}
          <span className="font-mono text-xs tabular-nums text-zinc-400">
            {formatElapsed(elapsed)}
          </span>
        </div>
      </div>

      {/* ── Error banner ── */}
      {showError && (
        <div className="mx-auto w-full max-w-xl px-5">
          <div className="flex items-center gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3">
            <p className="flex-1 text-sm text-amber-100">{error}</p>
            {status === "error" && (
              <GhostButton
                className="h-8 shrink-0 px-3 text-xs"
                onClick={() => {
                  setDismissedError(null);
                  void connect();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reconnect
              </GhostButton>
            )}
            <button
              onClick={() => setDismissedError(error)}
              className="shrink-0 rounded p-1 text-amber-200/70 transition-colors hover:text-amber-100"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Center stage ── */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-5 py-8">
        <div className="flex flex-col items-center gap-5">
          <InterviewerOrb status={status} outputLevel={outputLevel} />
          <p
            className="text-sm font-medium tracking-wide text-emerald-300/90"
            aria-live="polite"
          >
            {finalizing
              ? "Wrapping up…"
              : ending
                ? "Ending…"
                : micOpen
                  ? "Your turn — I'm listening"
                  : orbStatusWord(status)}
          </p>
        </div>

        {/* Interviewer caption */}
        <div className="flex min-h-[7rem] w-full max-w-2xl flex-col items-center gap-4">
          <p className="text-center text-lg leading-relaxed text-zinc-100 [text-wrap:balance]">
            {captionWords.map((word, i) => (
              <span key={`${i}-${word}`} className="iv-cap-word">
                {word}{" "}
              </span>
            ))}
          </p>

          {/* Candidate's own live words */}
          {transcript && (
            <p
              className={cx(
                "max-w-xl text-center text-sm leading-relaxed transition-opacity duration-500",
                status === "listening" ? "text-zinc-400" : "text-zinc-400/60"
              )}
            >
              {transcript}
            </p>
          )}
        </div>
      </div>

      {/* ── Push-to-talk ── */}
      <div className="flex flex-col items-center gap-3 px-5 pb-5">
        <button
          type="button"
          onClick={toggleMic}
          disabled={micDisabled}
          aria-pressed={micOpen}
          aria-label={micOpen ? "Send your answer" : "Tap to speak"}
          className={cx(
            "relative inline-flex h-14 min-w-[16rem] items-center justify-center gap-2.5 rounded-full px-8",
            "text-sm font-semibold transition-colors duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1210]",
            micOpen
              ? "bg-red-500 text-white hover:bg-red-400 focus-visible:ring-red-300/70"
              : "bg-emerald-400 text-[#06251a] hover:bg-emerald-300 focus-visible:ring-emerald-300/70",
            "disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500"
          )}
        >
          {/* Live mic energy — proof the room is actually being heard. */}
          {micOpen && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-red-400/50"
              style={{
                transform: `scale(${(1 + Math.min(0.07, micLevel * 0.5)).toFixed(3)})`,
                transition: "transform 90ms linear",
              }}
            />
          )}
          {micOpen ? (
            <>
              <Send className="h-4 w-4" />
              Tap to send
              <span className="font-mono text-xs tabular-nums opacity-80">
                {formatElapsed(answerSeconds)}
              </span>
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" />
              Tap to speak
            </>
          )}
        </button>

        <p
          className={cx(
            "min-h-4 text-center text-xs",
            hint ? "text-amber-200" : "text-zinc-400"
          )}
          aria-live="polite"
        >
          {hint ??
            (micOpen
              ? "Recording — tap again when you've finished your answer"
              : canSpeak
                ? "Tap, or press Space, when you're ready to answer"
                : status === "thinking"
                  ? "One moment…"
                  : "")}
        </p>
      </div>

      {/* ── Bottom controls ── */}
      <div className="flex items-center justify-center gap-3 px-5 pb-6 sm:pb-8">
        <GhostButton
          onClick={repeat}
          disabled={!live || micOpen || busy}
          className="h-10 px-4 text-xs"
        >
          <Repeat className="h-3.5 w-3.5" /> Repeat question
        </GhostButton>
        <button
          onClick={() => setConfirmEnd(true)}
          disabled={ending || finalizing}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-4 text-xs font-medium text-red-300 transition-colors duration-200 hover:border-red-400/50 hover:bg-red-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {ending || finalizing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PhoneOff className="h-3.5 w-3.5" />
          )}
          End interview
        </button>
      </div>

      {/* ── Candidate PiP ── */}
      {cameraStream && (
        <div className="pointer-events-none fixed bottom-40 right-5 z-10 sm:bottom-44 sm:right-8">
          <video
            ref={pipRef}
            autoPlay
            muted
            playsInline
            className="aspect-[4/3] w-36 -scale-x-100 rounded-xl object-cover shadow-2xl ring-1 ring-white/20 sm:w-44"
          />
        </div>
      )}

      {/* ── Dev text input (localStorage 'interview_dev') ── */}
      {devMode && (
        <form
          className="fixed bottom-5 left-5 z-10 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendText(devText);
            setDevText("");
          }}
        >
          <input
            value={devText}
            onChange={(e) => setDevText(e.target.value)}
            placeholder="dev: type an answer"
            className="h-9 w-56 rounded-lg border border-white/15 bg-black/40 px-3 text-xs text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
          />
        </form>
      )}

      {/* ── End confirm dialog ── */}
      {confirmEnd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="End interview confirmation"
        >
          <div className="iv-step-in w-full max-w-sm rounded-2xl border border-white/10 bg-[#101a16] p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-zinc-100">End interview?</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Your answers so far will be submitted and the interview can&rsquo;t
              be resumed. Only end if you&rsquo;re finished.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <GhostButton
                className="h-10 px-4 text-xs"
                onClick={() => setConfirmEnd(false)}
              >
                Keep going
              </GhostButton>
              <button
                onClick={handleEnd}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 text-xs font-semibold text-white transition-colors hover:bg-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
              >
                <PhoneOff className="h-3.5 w-3.5" /> End interview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
