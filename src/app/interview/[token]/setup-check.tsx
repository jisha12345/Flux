"use client";

/** Step 2 — device checks: camera, microphone, speakers, gateway connectivity. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  Mic,
  RefreshCw,
  Volume2,
  Wifi,
} from "lucide-react";
import { GATEWAY_URL } from "./use-interview-stream";
import { GhostButton, Panel, PrimaryButton, cx } from "./ui";

type CheckState = "pending" | "ok" | "fail";

function StateBadge({ state }: { state: CheckState }) {
  if (state === "ok") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-400">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (state === "fail") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-400/15 text-red-400">
        <AlertTriangle className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-white/25">
      <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
    </span>
  );
}

function MicMeter({ level }: { level: number }) {
  const BARS = 24;
  const lit = Math.round(Math.min(1, level * 4) * BARS);
  return (
    <div className="flex h-8 items-center gap-[3px]" aria-hidden>
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          className={cx(
            "w-[5px] rounded-full transition-all duration-100",
            i < lit
              ? i > BARS * 0.8
                ? "bg-amber-400"
                : "bg-emerald-400"
              : "bg-white/10"
          )}
          style={{ height: `${30 + Math.sin((i / BARS) * Math.PI) * 70}%` }}
        />
      ))}
    </div>
  );
}

export function SetupCheck({
  cameraStream,
  cameraError,
  onRetryCamera,
  micLevel,
  micError,
  onRetryMic,
  playChime,
  onContinue,
}: {
  cameraStream: MediaStream | null;
  cameraError: string | null;
  onRetryCamera: () => void;
  micLevel: number;
  micError: string | null;
  onRetryMic: () => void;
  playChime: () => void;
  onContinue: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [voiceHeard, setVoiceHeard] = useState(false);
  const [chimePlayed, setChimePlayed] = useState(false);
  const [speakersOk, setSpeakersOk] = useState(false);
  const [gateway, setGateway] = useState<CheckState>("pending");

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  useEffect(() => {
    if (!voiceHeard && micLevel > 0.045) setVoiceHeard(true);
  }, [micLevel, voiceHeard]);

  const checkGateway = useCallback(async () => {
    setGateway("pending");
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${GATEWAY_URL}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      const body = (await res.json()) as { ok?: boolean };
      setGateway(res.ok && body.ok ? "ok" : "fail");
    } catch {
      setGateway("fail");
    }
  }, []);

  useEffect(() => {
    void checkGateway();
  }, [checkGateway]);

  const cameraState: CheckState = cameraError
    ? "fail"
    : cameraStream
      ? "ok"
      : "pending";
  const micState: CheckState = micError ? "fail" : voiceHeard ? "ok" : "pending";
  const speakerState: CheckState = speakersOk ? "ok" : "pending";
  const allOk =
    cameraState === "ok" && micState === "ok" && speakersOk && gateway === "ok";

  return (
    <div className="w-full max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-100 [text-wrap:balance]">
        Let&rsquo;s check your devices
      </h1>
      <p className="mt-2 text-sm text-zinc-400">
        Your interview is a voice conversation, so we need your camera,
        microphone, and speakers working before we begin.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-[1.15fr_1fr]">
        {/* Camera */}
        <Panel className="flex flex-col overflow-hidden p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Camera className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-medium text-zinc-100">Camera</span>
            </div>
            <StateBadge state={cameraState} />
          </div>
          <div className="mt-4 flex-1">
            {cameraError ? (
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-black/30 p-6 text-center">
                <p className="max-w-[26ch] text-sm text-zinc-300">{cameraError}</p>
                <GhostButton onClick={onRetryCamera} className="h-9 px-4 text-xs">
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </GhostButton>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-xl bg-black/40">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="aspect-[4/3] w-full -scale-x-100 object-cover"
                />
                {!cameraStream && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
                    Waiting for camera…
                  </div>
                )}
              </div>
            )}
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          {/* Microphone */}
          <Panel className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Mic className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium text-zinc-100">
                  Microphone
                </span>
              </div>
              <StateBadge state={micState} />
            </div>
            {micError ? (
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-300">{micError}</p>
                <GhostButton onClick={onRetryMic} className="h-9 px-4 text-xs">
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </GhostButton>
              </div>
            ) : (
              <div className="mt-4">
                <MicMeter level={micLevel} />
                <p className="mt-2 text-xs text-zinc-400">
                  {voiceHeard
                    ? "Sounding great."
                    : "Say something. “Testing, one two” works."}
                </p>
              </div>
            )}
          </Panel>

          {/* Speakers */}
          <Panel className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Volume2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium text-zinc-100">Speakers</span>
              </div>
              <StateBadge state={speakerState} />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <GhostButton
                className="h-9 px-4 text-xs"
                onClick={() => {
                  playChime();
                  setChimePlayed(true);
                }}
              >
                <Volume2 className="h-3.5 w-3.5" />
                {chimePlayed ? "Play again" : "Play test sound"}
              </GhostButton>
              {chimePlayed && !speakersOk && (
                <PrimaryButton
                  className="h-9 px-4 text-xs"
                  onClick={() => setSpeakersOk(true)}
                >
                  I heard it
                </PrimaryButton>
              )}
              {speakersOk && (
                <span className="text-xs text-zinc-400">Speakers confirmed.</span>
              )}
            </div>
          </Panel>

          {/* Gateway connectivity */}
          <Panel className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Wifi className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium text-zinc-100">
                  Interview connection
                </span>
              </div>
              <StateBadge state={gateway} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-400">
                {gateway === "ok"
                  ? "Connected to the interview server."
                  : gateway === "fail"
                    ? "Couldn't reach the interview server."
                    : "Checking connection…"}
              </p>
              {gateway === "fail" && (
                <GhostButton
                  onClick={() => void checkGateway()}
                  className="h-9 px-4 text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </GhostButton>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <PrimaryButton onClick={onContinue} disabled={!allOk}>
          Continue
        </PrimaryButton>
      </div>
    </div>
  );
}
