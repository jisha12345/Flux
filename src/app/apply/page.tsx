"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

const SHIPROCKET_ORANGE = "#F26522";

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" />
  </svg>
);

const QUESTIONS = [
  { id: "current_role", label: "What's your current role and company?" },
  { id: "experience", label: "How many years of professional engineering experience do you have?" },
  { id: "phone", label: "What's your phone number?", optional: true },
  { id: "skills", label: "List your top 5 technical skills." },
  { id: "biggest_project", label: "Tell us about the most complex technical project you've shipped. What was your role, what made it hard, what did you learn?" },
  { id: "ai_usage", label: "How do you actually use AI in your day-to-day work? Be specific — tools, workflows, what you've built or automated." },
  { id: "proud_of", label: "What's a piece of code or system design you're genuinely proud of? Walk us through it." },
  { id: "hard_problem", label: "Describe a technically hard problem you solved recently. What made it hard? How did you approach it?" },
  { id: "learning", label: "What are you learning right now, and why?" },
  { id: "collaboration", label: "How do you approach code reviews and technical disagreements with teammates?" },
  { id: "scale", label: "Have you worked on systems at scale? Tell us about the scale and what that required of you." },
  { id: "open_source", label: "Any open source contributions, side projects, or public work you want to share?", optional: true },
  { id: "why_now", label: "Why are you looking to move now?" },
  { id: "anything_else", label: "Anything else you want us to know?", optional: true },
];

function AnimatedStep({ children, visible }: { children: React.ReactNode; visible: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (visible) {
      el.style.transition = "opacity 0.4s ease, transform 0.4s ease";
      el.style.opacity = "1";
      el.style.transform = "translateX(0)";
    } else {
      el.style.opacity = "0";
      el.style.transform = "translateX(40px)";
    }
  }, [visible]);
  return (
    <div ref={ref} style={{ opacity: 0, transform: "translateX(40px)" }}>
      {children}
    </div>
  );
}

export default function ApplyPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/apply` },
    });
  }

  async function handleSubmit() {
    if (!user) return;
    setSubmitting(true);
    await fetch("/api/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: user.user_metadata?.full_name ?? user.email,
        email: user.email,
        ...answers,
      }),
    });
    setSubmitted(true);
    setSubmitting(false);
  }

  const totalSteps = QUESTIONS.length;
  const progress = ((step + 1) / totalSteps) * 100;
  const current = QUESTIONS[step];

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F4F5F7" }}>
        <div className="w-6 h-6 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: SHIPROCKET_ORANGE }} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "#F4F5F7" }}>
        <div className="bg-white rounded-3xl p-10 shadow-sm border border-gray-100 max-w-sm w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: SHIPROCKET_ORANGE }}>
              <ShieldIcon className="w-7 h-7 fill-white" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Apply to Reqr</h1>
            <p className="text-gray-400 text-sm">Sign in with Google to start. We&apos;ll prefill your name and email.</p>
          </div>
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-white border-2 border-gray-200 text-gray-700 font-semibold rounded-2xl hover:border-gray-300 hover:bg-gray-50 transition-all text-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>
          <p className="text-xs text-gray-300">14 questions · ~5 minutes · AI reviews instantly</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F4F5F7" }}>
        <div className="bg-white rounded-3xl p-10 shadow-sm border border-gray-100 max-w-sm w-full text-center space-y-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto text-2xl"
            style={{ background: "rgba(242,101,34,0.1)" }}
          >
            ✓
          </div>
          <h1 className="text-2xl font-bold text-gray-900">You&apos;re in the stack.</h1>
          <p className="text-gray-400 text-sm">Our AI is reviewing your answers now. You&apos;ll hear back within 48 hours.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F4F5F7" }}>
      {/* Nav */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: SHIPROCKET_ORANGE }}>
            <ShieldIcon className="w-4 h-4 fill-white" />
          </div>
          <span className="font-bold text-lg text-gray-900">Reqr</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm hidden sm:block">{step + 1} of {totalSteps}</span>
          {user.user_metadata?.full_name && (
            <span className="text-xs text-gray-400 hidden sm:block">{user.user_metadata.full_name}</span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-8">
        <div className="h-1 rounded-full overflow-hidden" style={{ background: "#f3f4f6" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ background: SHIPROCKET_ORANGE, width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-10">
        <div className="w-full max-w-xl">
          <AnimatedStep visible={true} key={step}>
            <div className="space-y-8">
              <div className="space-y-3">
                <p className="text-gray-400 text-xs font-mono">{String(step + 1).padStart(2, "0")} / {totalSteps}</p>
                <h2 className="text-2xl sm:text-3xl font-semibold leading-snug text-gray-900">
                  {current.label}
                </h2>
                {current.optional && <p className="text-xs text-gray-400">Optional — skip with Continue</p>}
              </div>

              <div className="space-y-3">
                <textarea
                  autoFocus
                  value={answers[current.id] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [current.id]: e.target.value })}
                  placeholder={current.optional ? "Optional…" : "Your answer…"}
                  rows={4}
                  className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3.5 text-gray-900 placeholder-gray-400 outline-none text-base transition-all resize-none"
                  style={{ "--tw-ring-color": `${SHIPROCKET_ORANGE}1a` } as React.CSSProperties}
                  onFocus={(e) => { e.currentTarget.style.borderColor = SHIPROCKET_ORANGE; e.currentTarget.style.boxShadow = `0 0 0 4px rgba(242,101,34,0.1)`; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>

              <div className="flex items-center justify-between">
                {step > 0 ? (
                  <button
                    onClick={() => setStep(step - 1)}
                    className="px-5 py-2.5 text-gray-500 font-medium rounded-xl hover:bg-gray-100 transition-all text-sm"
                  >
                    ← Back
                  </button>
                ) : <span />}

                {step < totalSteps - 1 ? (
                  <button
                    onClick={() => setStep(step + 1)}
                    disabled={!current.optional && !answers[current.id]?.trim()}
                    className="px-8 py-3 text-white font-semibold rounded-xl disabled:opacity-40 hover:opacity-90 active:scale-95 transition-all text-sm shadow-md"
                    style={{ background: SHIPROCKET_ORANGE, boxShadow: "0 4px 14px rgba(242,101,34,0.25)" }}
                  >
                    Continue →
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || (!current.optional && !answers[current.id]?.trim())}
                    className="px-8 py-3 text-white font-semibold rounded-xl disabled:opacity-40 hover:opacity-90 active:scale-95 transition-all text-sm shadow-md"
                    style={{ background: SHIPROCKET_ORANGE, boxShadow: "0 4px 14px rgba(242,101,34,0.25)" }}
                  >
                    {submitting ? "Submitting…" : "Submit application →"}
                  </button>
                )}
              </div>
            </div>
          </AnimatedStep>
        </div>
      </div>
    </div>
  );
}
