"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
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
  { id: "ai_usage", label: "How do you use AI in your day-to-day work? Name the tools, the workflows, and anything you have built or automated." },
  { id: "proud_of", label: "What's a piece of code or system design you're genuinely proud of? Walk us through it." },
  { id: "hard_problem", label: "Describe a technically hard problem you solved recently. What made it hard? How did you approach it?" },
  { id: "learning", label: "What are you learning right now, and why?" },
  { id: "collaboration", label: "How do you approach code reviews and technical disagreements with teammates?" },
  { id: "scale", label: "Have you worked on systems at scale? Tell us about the scale and what that required of you." },
  { id: "open_source", label: "Any open source contributions, side projects, or public work you want to share?", optional: true },
  { id: "why_now", label: "Why are you looking to move now?" },
  { id: "anything_else", label: "Anything else you want us to know?", optional: true },
];

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
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-white">
        <div className="max-w-sm w-full space-y-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="w-6 h-6 rounded flex items-center justify-center" style={{ background: SHIPROCKET_ORANGE }}>
              <ShieldIcon className="w-3.5 h-3.5 fill-white" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-[#14161a]">Reqr</span>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#14161a]">Apply for a role</h1>
            <p className="mt-2 text-[15px] leading-[1.6] text-[#4b5563]">
              Sign in with Google so your name and email are filled in for you.
            </p>
          </div>
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white border border-[#d5d8dd] text-[#14161a] font-medium rounded-md hover:border-[#9ca3af] transition-colors text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F26522] focus-visible:ring-offset-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>
          <p className="text-[13px] text-[#6b7280]">
            14 questions, around 5 minutes. Three are optional.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-white">
        <div className="max-w-sm w-full space-y-4">
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(242,101,34,0.12)" }}
          >
            <Check className="w-4 h-4" strokeWidth={2.25} style={{ color: SHIPROCKET_ORANGE }} aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-[#14161a]">Application received</h1>
          <p className="text-[15px] leading-[1.6] text-[#4b5563]">
            Your answers are being scored against the role now. The team will be
            in touch within 48 hours.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="border-b border-[#e7e9ec] px-5 sm:px-8 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="w-6 h-6 rounded flex items-center justify-center" style={{ background: SHIPROCKET_ORANGE }}>
            <ShieldIcon className="w-3.5 h-3.5 fill-white" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-[#14161a]">Reqr</span>
        </Link>
        <div className="flex items-center gap-4 text-[13px] text-[#6b7280]">
          <span className="tabular-nums">Question {step + 1} of {totalSteps}</span>
          {user.user_metadata?.full_name && (
            <span className="hidden sm:block">{user.user_metadata.full_name}</span>
          )}
        </div>
      </div>

      <div
        className="h-0.5 bg-[#eef0f2]"
        role="progressbar"
        aria-valuenow={step + 1}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        aria-label="Application progress"
      >
        <div
          className="h-full transition-[width] duration-300"
          style={{ background: SHIPROCKET_ORANGE, width: `${progress}%` }}
        />
      </div>

      <div className="flex-1 px-5 sm:px-8 py-12 sm:py-16">
        <div className="w-full max-w-xl mx-auto">
          <div className="space-y-7">
            <div className="space-y-2.5">
              <h2 className="text-[22px] sm:text-[26px] font-semibold leading-snug tracking-tight text-[#14161a]">
                {current.label}
              </h2>
              {current.optional && (
                <p className="text-[13px] text-[#6b7280]">Optional. Continue to skip it.</p>
              )}
            </div>

            <textarea
              autoFocus
              key={step}
              value={answers[current.id] ?? ""}
              onChange={(e) => setAnswers({ ...answers, [current.id]: e.target.value })}
              placeholder={current.optional ? "Optional" : "Your answer"}
              rows={5}
              aria-label={current.label}
              className="w-full bg-white border border-[#d5d8dd] rounded-md px-3.5 py-3 text-[#14161a] placeholder:text-[#9ca3af] outline-none text-[15px] leading-[1.6] resize-none transition-colors focus:border-[#9ca3af] focus-visible:ring-2 focus-visible:ring-[#F26522] focus-visible:ring-offset-1"
            />

            <div className="flex items-center justify-between">
              {step > 0 ? (
                <button
                  onClick={() => setStep(step - 1)}
                  className="px-4 py-2.5 text-[#4b5563] font-medium rounded-md hover:bg-[#f4f5f6] transition-colors text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F26522] focus-visible:ring-offset-2"
                >
                  Back
                </button>
              ) : <span />}

              {step < totalSteps - 1 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={!current.optional && !answers[current.id]?.trim()}
                  className="px-6 py-2.5 text-white font-medium rounded-md disabled:opacity-40 hover:opacity-90 transition-opacity text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F26522] focus-visible:ring-offset-2"
                  style={{ background: SHIPROCKET_ORANGE }}
                >
                  Continue
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting || (!current.optional && !answers[current.id]?.trim())}
                  className="px-6 py-2.5 text-white font-medium rounded-md disabled:opacity-40 hover:opacity-90 transition-opacity text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F26522] focus-visible:ring-offset-2"
                  style={{ background: SHIPROCKET_ORANGE }}
                >
                  {submitting ? "Submitting" : "Submit application"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
