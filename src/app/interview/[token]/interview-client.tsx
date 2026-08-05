"use client";

/**
 * The candidate-facing AI interview experience — 5 steps:
 * welcome → device setup → identity → interview room → done.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Globe2, Mic, ShieldCheck, Video } from "lucide-react";
import { IdentityStep } from "./identity-step";
import { InterviewRoom } from "./interview-room";
import { SetupCheck } from "./setup-check";
import {
  BrandHeader,
  Chip,
  Panel,
  PrimaryButton,
  cx,
  firstNameOf,
  languageLabel,
} from "./ui";
import { useInterviewStream } from "./use-interview-stream";

export interface InterviewClientProps {
  token: string;
  candidateName: string;
  roleTitle: string;
  company: string;
  language: string;
  durationMinutes: number;
  status: string;
}

type Step = "welcome" | "setup" | "identity" | "room" | "done";

const GLOBAL_STYLES = `
@keyframes iv-step-in {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes iv-cap-word {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes orb-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.045); }
}
@keyframes orb-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}
@keyframes orb-spin {
  to { transform: rotate(360deg); }
}
@keyframes iv-draw {
  to { stroke-dashoffset: 0; }
}
.iv-step-in { animation: iv-step-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
.iv-cap-word { display: inline; animation: iv-cap-word 0.4s ease-out both; }
.iv-check-circle {
  stroke-dasharray: 166; stroke-dashoffset: 166;
  animation: iv-draw 0.7s cubic-bezier(0.65, 0, 0.45, 1) 0.15s forwards;
}
.iv-check-path {
  stroke-dasharray: 48; stroke-dashoffset: 48;
  animation: iv-draw 0.4s cubic-bezier(0.65, 0, 0.45, 1) 0.85s forwards;
}
@media (prefers-reduced-motion: reduce) {
  .iv-root *, .iv-root *::before, .iv-root *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;

export default function InterviewClient(props: InterviewClientProps) {
  const { token, candidateName, roleTitle, company, language, durationMinutes } =
    props;
  const firstName = firstNameOf(candidateName);
  const stream = useInterviewStream(token);

  const [step, setStep] = useState<Step>("welcome");
  const [consented, setConsented] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const cameraRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    if (cameraRef.current) return;
    setCameraError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      });
      cameraRef.current = media;
      setCameraStream(media);
    } catch {
      setCameraError(
        "We couldn't access your camera. Allow camera access in your browser, then try again."
      );
    }
  }, []);

  const stopCamera = useCallback(() => {
    for (const track of cameraRef.current?.getTracks() ?? []) track.stop();
    cameraRef.current = null;
    setCameraStream(null);
  }, []);

  useEffect(() => {
    return () => {
      for (const track of cameraRef.current?.getTracks() ?? []) track.stop();
      cameraRef.current = null;
    };
  }, []);

  const startMic = useCallback(() => {
    setMicError(null);
    stream
      .initMic()
      .then(() => {
        // Open the gateway socket as soon as we have a mic. The blueprint, the
        // STT socket and the TTS socket all warm up while the candidate is
        // still checking their camera and taking their photo, instead of being
        // the first thing they wait on once the room loads.
        void stream.connect();
      })
      .catch(() => {
        setMicError(
          "Microphone access was blocked. Allow it in your browser, then retry."
        );
      });
  }, [stream]);

  const enterSetup = useCallback(() => {
    setStep("setup");
    void startCamera();
    startMic();
  }, [startCamera, startMic]);

  const playChime = useCallback(() => {
    const actx = stream.getAudioContext();
    const t = actx.currentTime + 0.05;
    for (const [i, freq] of [659.25, 880].entries()) {
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const at = t + i * 0.18;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.22, at + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
      osc.connect(gain);
      gain.connect(actx.destination);
      osc.start(at);
      osc.stop(at + 0.6);
    }
  }, [stream]);

  const handleFinished = useCallback(() => {
    stopCamera();
    stream.teardown();
    setStep("done");
  }, [stopCamera, stream]);

  return (
    <div className="iv-root relative min-h-[100dvh] bg-[#0B1210] text-zinc-100 antialiased">
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_STYLES }} />

      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(52,211,153,0.07), transparent 65%), radial-gradient(ellipse 55% 40% at 85% 100%, rgba(69,148,112,0.05), transparent 70%)",
        }}
      />

      {step === "room" ? (
        <div className="relative">
          <InterviewRoom
            token={token}
            cameraStream={cameraStream}
            stream={stream}
            onFinished={handleFinished}
          />
        </div>
      ) : (
        <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-4xl flex-col px-5 py-6 sm:px-8 sm:py-8">
          <BrandHeader
            right={
              step !== "done" ? (
                <div className="flex items-center gap-1.5" aria-hidden>
                  {(["welcome", "setup", "identity"] as const).map((s, i) => {
                    const order: Step[] = ["welcome", "setup", "identity"];
                    const activeIdx = order.indexOf(step as Step);
                    return (
                      <span
                        key={s}
                        className={cx(
                          "h-1 rounded-full transition-all duration-500",
                          i <= activeIdx ? "w-6 bg-emerald-400" : "w-3 bg-white/15"
                        )}
                      />
                    );
                  })}
                </div>
              ) : undefined
            }
          />

          <main className="flex flex-1 items-center justify-center py-10">
            {step === "welcome" && (
              <div key="welcome" className="iv-step-in w-full max-w-xl">
                <p className="text-sm font-medium text-emerald-400">
                  Hi {firstName},
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100 [text-wrap:balance] sm:text-4xl">
                  Welcome to your interview for {roleTitle}
                </h1>
                <p className="mt-3 text-base text-zinc-400">
                  On behalf of{" "}
                  <span className="font-medium text-zinc-200">{company}</span>.
                  A relaxed voice conversation, at your pace.
                </p>

                <div className="mt-6 flex flex-wrap gap-2">
                  <Chip>
                    <Clock className="h-3.5 w-3.5 text-emerald-400" />
                    About {durationMinutes} minutes
                  </Chip>
                  <Chip>
                    <Globe2 className="h-3.5 w-3.5 text-emerald-400" />
                    {languageLabel(language)}
                  </Chip>
                  <Chip>
                    <Mic className="h-3.5 w-3.5 text-emerald-400" />
                    Voice conversation
                  </Chip>
                </div>

                <Panel className="mt-8 divide-y divide-white/5 p-1">
                  {[
                    {
                      icon: Mic,
                      title: "You control the mic",
                      text: "An AI interviewer asks the questions. Tap “Tap to speak” to answer, then pause when you're done and it sends automatically. You can also tap again to send sooner. Nothing is heard until you tap, so background noise never cuts you off.",
                    },
                    {
                      icon: Video,
                      title: "Your interview is recorded",
                      text: "Camera and microphone are recorded so the hiring team can review your interview.",
                    },
                    {
                      icon: ShieldCheck,
                      title: "Evaluated fairly",
                      text: "You're assessed only on job-related competencies, nothing else.",
                    },
                  ].map(({ icon: Icon, title, text }) => (
                    <div key={title} className="flex gap-4 p-4">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-zinc-100">{title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                          {text}
                        </p>
                      </div>
                    </div>
                  ))}
                </Panel>

                <label className="mt-6 flex cursor-pointer items-start gap-3 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={consented}
                    onChange={(e) => setConsented(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-emerald-500"
                  />
                  <span>
                    I consent to this interview being recorded and evaluated by AI
                  </span>
                </label>

                <div className="mt-8">
                  <PrimaryButton
                    onClick={enterSetup}
                    disabled={!consented}
                    className="w-full sm:w-auto"
                  >
                    Set up my devices
                  </PrimaryButton>
                </div>
              </div>
            )}

            {step === "setup" && (
              <div key="setup" className="iv-step-in flex w-full justify-center">
                <SetupCheck
                  cameraStream={cameraStream}
                  cameraError={cameraError}
                  onRetryCamera={() => void startCamera()}
                  micLevel={stream.micLevel}
                  micError={micError}
                  onRetryMic={startMic}
                  playChime={playChime}
                  onContinue={() => setStep("identity")}
                />
              </div>
            )}

            {step === "identity" && (
              <div key="identity" className="iv-step-in flex w-full justify-center">
                <IdentityStep
                  token={token}
                  candidateName={candidateName}
                  cameraStream={cameraStream}
                  onStart={() => setStep("room")}
                />
              </div>
            )}

            {step === "done" && (
              <div
                key="done"
                className="iv-step-in flex w-full max-w-md flex-col items-center text-center"
              >
                <svg
                  viewBox="0 0 52 52"
                  className="h-20 w-20"
                  aria-hidden
                  fill="none"
                >
                  <circle
                    className="iv-check-circle"
                    cx="26"
                    cy="26"
                    r="24"
                    stroke="#34d399"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    className="iv-check-path"
                    d="M15 27l8 8 15-16"
                    stroke="#34d399"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <h1 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-100 [text-wrap:balance]">
                  Thanks {firstName}, you&rsquo;re all done
                </h1>
                <p className="mt-3 max-w-[44ch] text-base leading-relaxed text-zinc-400">
                  Your interview has been submitted. The {company} team will
                  review it and be in touch soon.
                </p>
                <p className="mt-6 text-sm text-zinc-400">
                  You can safely close this tab.
                </p>
              </div>
            )}
          </main>

          <footer className="pt-4 text-center text-xs text-zinc-500">
            Powered by Hyr · AI interviews, evaluated fairly
          </footer>
        </div>
      )}
    </div>
  );
}
