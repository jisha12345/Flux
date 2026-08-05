"use client";

/**
 * The AI interviewer's presence — a layered radial-gradient orb.
 *
 * listening → slow breathing pulse
 * thinking  → rotating conic shimmer ring
 * speaking  → faster pulse, subtly modulated by live TTS output level
 */

import type { InterviewStreamStatus } from "./use-interview-stream";

export function InterviewerOrb({
  status,
  outputLevel,
}: {
  status: InterviewStreamStatus;
  outputLevel: number;
}) {
  const speaking = status === "speaking";
  const thinking = status === "thinking";
  const listening = status === "listening";
  const idle = !speaking && !thinking && !listening;

  // Data-driven modulation while speaking: 1.00 → ~1.12 with voice energy.
  const voiceScale = speaking ? 1 + Math.min(0.12, outputLevel * 0.55) : 1;

  return (
    <div className="relative h-[180px] w-[180px]" aria-hidden>
      {/* Halo */}
      <div
        className={`absolute -inset-10 rounded-full blur-2xl transition-opacity duration-700 ${
          idle ? "opacity-30" : "opacity-70"
        }`}
        style={{
          background:
            "radial-gradient(circle, rgba(52,211,153,0.35) 0%, rgba(20,184,166,0.16) 50%, transparent 72%)",
          animation: speaking
            ? "orb-breathe 1.6s ease-in-out infinite"
            : "orb-breathe 4.5s ease-in-out infinite",
        }}
      />

      {/* Thinking shimmer ring */}
      <div
        className={`absolute -inset-2 rounded-full transition-opacity duration-500 ${
          thinking ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgba(110,231,183,0.9) 55deg, rgba(45,212,191,0.35) 110deg, transparent 160deg, transparent 360deg)",
          animation: "orb-spin 1.4s linear infinite",
          filter: "blur(6px)",
        }}
      />

      {/* Voice-energy wrapper (inline transform must not fight the CSS animation) */}
      <div
        className="absolute inset-0 will-change-transform"
        style={{
          transform: `scale(${voiceScale.toFixed(3)})`,
          transition: "transform 90ms linear",
        }}
      >
        {/* Core */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 34% 28%, #a7f3d0 0%, #34d399 32%, #0f9c7a 62%, #14544a 88%, #0e3f3a 100%)",
            boxShadow:
              "0 0 90px rgba(52,211,153,0.30), inset 0 -18px 44px rgba(4,32,25,0.55), inset 0 12px 30px rgba(255,255,255,0.18)",
            animation: speaking
              ? "orb-pulse 1.15s ease-in-out infinite"
              : listening
                ? "orb-breathe 3.6s ease-in-out infinite"
                : undefined,
            opacity: thinking ? 0.88 : 1,
            transition: "opacity 500ms ease",
          }}
        />
        {/* Sheen */}
        <div
          className="absolute inset-[10%] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.35) 0%, transparent 42%)",
          }}
        />
      </div>
    </div>
  );
}

export function orbStatusWord(status: InterviewStreamStatus): string {
  switch (status) {
    case "connecting":
      return "Connecting…";
    case "ready":
      return "Starting…";
    case "listening":
      return "Listening…";
    case "thinking":
      return "Thinking…";
    case "speaking":
      return "Speaking";
    case "completed":
      return "Interview complete";
    case "error":
      return "Connection lost";
    default:
      return "";
  }
}
