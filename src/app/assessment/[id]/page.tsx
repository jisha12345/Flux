"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";

const SHIPROCKET_ORANGE = "#F26522";

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" />
  </svg>
);

interface Question {
  id: string;
  text: string;
  type: string;
}

interface Assessment {
  id: string;
  title: string;
  questions: Question[];
  time_limit_minutes?: number;
}

export default function AssessmentPage() {
  const params = useParams();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [integrityScore, setIntegrityScore] = useState<number | null>(null);

  // Timer state
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Anti-cheat state
  const [tabSwitches, setTabSwitches] = useState(0);
  const [violationMsg, setViolationMsg] = useState<string | null>(null);

  const tabSwitchRef = useRef(0);
  const focusLossRef = useRef(0);
  const fullscreenRef = useRef(0);

  const showViolation = useCallback((msg: string) => {
    setViolationMsg(msg);
  }, []);

  useEffect(() => {
    fetch(`/api/assessment?id=${params.id}`)
      .then(r => r.json())
      .then(d => setAssessment(d.assessment))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    if (!started) return;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        tabSwitchRef.current += 1;
        setTabSwitches(tabSwitchRef.current);
        showViolation(`⚠️ Tab switch detected (${tabSwitchRef.current}×). This has been recorded and will affect your integrity score.`);
      }
    };

    const onBlur = () => {
      focusLossRef.current += 1;
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement && started) {
        fullscreenRef.current += 1;
        showViolation("⚠️ Fullscreen exited. Please re-enter fullscreen to continue. This violation has been recorded.");
      }
    };

    const blockCopy = (e: Event) => e.preventDefault();
    const blockContext = (e: Event) => e.preventDefault();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("copy", blockCopy);
    document.addEventListener("paste", blockCopy);
    document.addEventListener("contextmenu", blockContext);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("copy", blockCopy);
      document.removeEventListener("paste", blockCopy);
      document.removeEventListener("contextmenu", blockContext);
    };
  }, [started, showViolation]);

  // Countdown timer — starts when assessment starts
  useEffect(() => {
    if (!started || !assessment) return;
    const minutes = assessment.time_limit_minutes ?? 10;
    setTimeLeft(minutes * 60);
  }, [started, assessment]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const id = setInterval(() => setTimeLeft(t => (t !== null ? t - 1 : null)), 1000);
    return () => clearInterval(id);
  }, [timeLeft]);

  // Auto-submit when time runs out
  useEffect(() => {
    if (timeLeft === 0 && !submitted && !submitting) {
      handleSubmit();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  async function startAssessment() {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen not supported — proceed anyway
    }
    setStarted(true);
  }

  async function handleSubmit() {
    setSubmitting(true);
    const integrity = {
      tab_switches: tabSwitchRef.current,
      focus_losses: focusLossRef.current,
      fullscreen_warnings: fullscreenRef.current,
    };
    const res = await fetch("/api/assessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessment_id: params.id, answers, integrity }),
    });
    const data = await res.json();
    if (typeof data.integrity_score === "number") setIntegrityScore(data.integrity_score);
    setSubmitted(true);
    setSubmitting(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => null);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#F4F5F7" }}>
      <div className="w-6 h-6 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: SHIPROCKET_ORANGE }} />
    </div>
  );

  if (!assessment) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#F4F5F7" }}>
      <p className="text-gray-500">Assessment not found.</p>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "#F4F5F7" }}>
      <div className="bg-white rounded-3xl p-10 shadow-sm border border-gray-100 max-w-sm w-full text-center space-y-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto text-2xl" style={{ background: "rgba(242,101,34,0.1)" }}>
          ✓
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Assessment submitted</h1>
        <p className="text-gray-400 text-sm">Thanks! We&apos;ll review your responses and be in touch soon.</p>
        {integrityScore !== null && (
          <div className="mt-4 rounded-xl border p-4" style={{ background: integrityScore >= 80 ? "#f0fdf4" : integrityScore >= 50 ? "#fffbeb" : "#fef2f2" }}>
            <p className="text-sm font-semibold" style={{ color: integrityScore >= 80 ? "#166534" : integrityScore >= 50 ? "#92400e" : "#991b1b" }}>
              Integrity score: {integrityScore}/100
            </p>
            {tabSwitches > 0 && <p className="text-xs text-gray-500 mt-1">Tab switches: {tabSwitches}</p>}
          </div>
        )}
      </div>
    </div>
  );

  if (!started) return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "#F4F5F7" }}>
      <div className="bg-white rounded-3xl p-10 shadow-sm border border-gray-100 max-w-md w-full space-y-6">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: SHIPROCKET_ORANGE }}>
            <ShieldIcon className="w-7 h-7 fill-white" />
          </div>
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: "var(--font-jakarta, inherit)" }}>{assessment.title}</h1>
          <p className="text-gray-400 text-sm">{assessment.questions.length} questions · {assessment.time_limit_minutes ?? 10} min time limit</p>
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-orange-900">Integrity monitoring is active</p>
          <ul className="space-y-1 text-xs text-orange-800">
            <li>· Tab switching is tracked and penalises your integrity score</li>
            <li>· Copy and paste are disabled</li>
            <li>· Right-click is disabled</li>
            <li>· AI tool usage is detectable from your answers</li>
            <li>· This assessment runs in fullscreen</li>
          </ul>
        </div>
        <button
          onClick={startAssessment}
          className="w-full py-3 text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-all"
          style={{ background: SHIPROCKET_ORANGE }}
        >
          Enter fullscreen & start →
        </button>
      </div>
    </div>
  );

  const current = assessment.questions[step];
  const progress = ((step + 1) / assessment.questions.length) * 100;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F4F5F7", userSelect: "none" }}>
      {/* Violation warning overlay */}
      {violationMsg && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="text-4xl">⚠️</div>
            <p className="text-gray-900 font-semibold text-sm">{violationMsg}</p>
            <button
              onClick={() => setViolationMsg(null)}
              className="w-full py-2.5 text-white font-semibold rounded-xl text-sm"
              style={{ background: SHIPROCKET_ORANGE }}
            >
              Continue assessment
            </button>
          </div>
        </div>
      )}

      {/* Nav */}
      <div className="bg-white border-b border-gray-200 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: SHIPROCKET_ORANGE }}>
            <ShieldIcon className="w-3.5 h-3.5 fill-white" />
          </div>
          <span className="font-bold text-gray-900 text-sm">Reqr</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-400">{step + 1}/{assessment.questions.length}</span>
          {timeLeft !== null && (
            <span className={`text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full ${timeLeft <= 60 ? "bg-red-100 text-red-600 animate-pulse" : timeLeft <= 180 ? "bg-orange-100 text-orange-600" : "bg-gray-100 text-gray-600"}`}>
              {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}
            </span>
          )}
          {tabSwitches > 0 && (
            <span className="text-xs text-red-500 font-medium">⚠️ {tabSwitches} violation{tabSwitches > 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="h-1 bg-gray-200">
        <div className="h-full transition-all duration-500" style={{ background: SHIPROCKET_ORANGE, width: `${progress}%` }} />
      </div>

      {/* Question */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-10">
        <div className="w-full max-w-xl space-y-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold" style={{ background: "rgba(242,101,34,0.1)", color: SHIPROCKET_ORANGE }}>
                {step + 1}
              </span>
              <span className="text-gray-400 text-xs">of {assessment.questions.length}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold leading-snug text-gray-900" style={{ fontFamily: "var(--font-jakarta, inherit)", letterSpacing: "-0.01em" }}>{current.text}</h2>
          </div>

          <textarea
            autoFocus
            value={answers[current.id] ?? ""}
            onChange={e => setAnswers({ ...answers, [current.id]: e.target.value })}
            placeholder="Type your answer here…"
            rows={6}
            className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-4 text-gray-900 placeholder-gray-300 outline-none text-[15px] leading-relaxed resize-none shadow-sm"
            style={{ fontFamily: "var(--font-inter, inherit)" }}
            onFocus={e => { e.currentTarget.style.borderColor = SHIPROCKET_ORANGE; e.currentTarget.style.boxShadow = "0 0 0 4px rgba(242,101,34,0.08)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
          />

          <div className="flex items-center justify-between">
            {step > 0 ? (
              <button onClick={() => setStep(step - 1)} className="px-5 py-2.5 text-gray-500 font-medium rounded-xl hover:bg-gray-100 transition-all text-sm">
                ← Back
              </button>
            ) : <span />}

            {step < assessment.questions.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!answers[current.id]?.trim()}
                className="px-8 py-3 text-white font-semibold rounded-xl disabled:opacity-40 hover:opacity-90 transition-all text-sm"
                style={{ background: SHIPROCKET_ORANGE, boxShadow: "0 4px 14px rgba(242,101,34,0.25)" }}
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting || !answers[current.id]?.trim()}
                className="px-8 py-3 text-white font-semibold rounded-xl disabled:opacity-40 hover:opacity-90 transition-all text-sm"
                style={{ background: SHIPROCKET_ORANGE, boxShadow: "0 4px 14px rgba(242,101,34,0.25)" }}
              >
                {submitting ? "Submitting…" : "Submit →"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
