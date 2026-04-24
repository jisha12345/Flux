"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const STEPS = [
  { id: "intro", question: "Hey. Before we get to the form — what's your name?", field: "full_name", placeholder: "Your full name", type: "text" },
  { id: "email", question: (name: string) => `Nice to meet you, ${name.split(" ")[0]}. What's your email?`, field: "email", placeholder: "you@example.com", type: "email" },
  { id: "phone", question: "Phone number?", field: "phone", placeholder: "+91 9876543210", type: "tel" },
  { id: "current_role", question: "What do you do right now?", field: "current_role", placeholder: "e.g. Product Manager", type: "text", subField: { field: "current_company", placeholder: "Company name" } },
  { id: "experience", question: "Years of experience?", field: "total_experience", placeholder: "e.g. 4", type: "text" },
  { id: "ctc", question: "CTC — current and expected. (in LPA)", field: "current_ctc", placeholder: "Current CTC (e.g. 18 LPA)", type: "text", subField: { field: "expected_ctc", placeholder: "Expected CTC (e.g. 25 LPA)" } },
  { id: "notice", question: "What's your notice period?", field: "notice_period", type: "select", options: ["Immediate", "15 days", "1 month", "2 months", "3 months", "Serving notice"] },
  { id: "location", question: "Where are you based, and where are you open to?", field: "current_location", placeholder: "Current city", type: "text", subField: { field: "preferred_location", placeholder: "Preferred city / open to relocation" } },
  { id: "wfh", question: "How do you like to work?", field: "wfh_preference", type: "select", options: ["Remote only", "Hybrid is fine", "In-office, I like the energy"], values: ["remote", "hybrid", "office"] },
  { id: "ai_comfort", question: "On a scale of 1–10, how deeply are you using AI in your work right now?", field: "ai_comfort_score", type: "select", options: ["1 — Just getting started", "2", "3", "4", "5 — Use it daily", "6", "7", "8", "9", "10 — It's my cofounder"], values: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] },
  { id: "ai_tools", question: "Which AI tools are actually part of your workflow? Be specific.", field: "ai_tools_used", placeholder: "e.g. Claude for code review, Cursor for dev, Midjourney for assets...", type: "textarea" },
  { id: "ai_project", question: "Tell us about something real you built or shipped using AI. Not a demo. Not a todo app.", field: "ai_project_built", placeholder: "What was the problem, what did you build, what happened after...", type: "textarea", skipIf: (data: Record<string, string>) => parseInt(data.ai_comfort_score || "0") < 5 },
  { id: "ai_vision", question: "If you joined us, how would AI change the way you do your job in the next 6 months?", field: "ai_future_vision", placeholder: "Paint us a picture...", type: "textarea" },
  { id: "ai_without", question: "Imagine tomorrow all your AI tools are gone. How does that make you feel?", field: "ai_without_tools_feeling", placeholder: "Honest answer...", type: "textarea" },
  { id: "biggest_build", question: "What's the most ambitious thing you've ever built — with or without AI?", field: "biggest_build", placeholder: "The one that still makes you proud...", type: "textarea" },
  { id: "why_us", question: "Why here, why now? (Skip the generic answer.)", field: "why_us", placeholder: "What specifically caught your attention...", type: "textarea" },
  { id: "links", question: "Drop your links — LinkedIn, GitHub, portfolio. (All optional)", field: "linkedin_url", placeholder: "LinkedIn URL (optional)", type: "text", optional: true, subField: { field: "github_url", placeholder: "GitHub URL (optional)" }, extraField: { field: "portfolio_url", placeholder: "Portfolio / website (optional)" } },
];

export default function ApplyPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [direction, setDirection] = useState(1);

  const step = STEPS[currentStep];
  const progress = (currentStep / STEPS.length) * 100;
  const currentValue = formData[step.field] || "";

  function handleChange(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function canProceed() {
    if ((step as { optional?: boolean }).optional) return true;
    if (!currentValue.trim()) return false;
    if (step.id === "ctc" && !formData["expected_ctc"]?.trim()) return false;
    if (step.id === "current_role" && !formData["current_company"]?.trim()) return false;
    if (step.id === "location" && !formData["preferred_location"]?.trim()) return false;
    return true;
  }

  function getNextStep(from: number): number {
    let next = from + 1;
    while (next < STEPS.length) {
      const s = STEPS[next] as { skipIf?: (data: Record<string, string>) => boolean };
      if (!s.skipIf || !s.skipIf(formData)) break;
      next++;
    }
    return next;
  }

  function getPrevStep(from: number): number {
    let prev = from - 1;
    while (prev > 0) {
      const s = STEPS[prev] as { skipIf?: (data: Record<string, string>) => boolean };
      if (!s.skipIf || !s.skipIf(formData)) break;
      prev--;
    }
    return prev;
  }

  async function handleNext() {
    if (!canProceed()) return;
    const next = getNextStep(currentStep);
    if (next < STEPS.length) {
      setDirection(1);
      setCurrentStep(next);
    } else {
      await handleSubmit();
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep(getPrevStep(currentStep));
    }
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Submission failed");
      setScore(data.score);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function getQuestion(): string {
    if (typeof step.question === "function") return step.question(formData["full_name"] || "there");
    return step.question;
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-violet-600/10 blur-[100px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-blue-600/10 blur-[100px]" />
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}
          className="max-w-lg w-full text-center space-y-8 relative z-10">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring" }} className="text-6xl">🎉</motion.div>
          <div className="space-y-3">
            <h1 className="text-4xl font-bold">You&apos;re in the pile.</h1>
            <p className="text-zinc-400 text-lg">We read every application ourselves. If there&apos;s a fit, you&apos;ll hear within a week.</p>
          </div>
          {score !== null && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="glass rounded-2xl p-8 space-y-4">
              <p className="text-zinc-500 text-sm uppercase tracking-wider">Your match score</p>
              <div className="relative w-32 h-32 mx-auto">
                <svg className="w-full h-full" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#27272a" strokeWidth="2.5" />
                  <circle cx="18" cy="18" r="15.9" fill="none"
                    stroke={score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#6366f1"}
                    strokeWidth="2.5" strokeDasharray={`${score} 100`} strokeLinecap="round" className="score-ring" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl font-bold">{score}</span>
                </div>
              </div>
              <p className="text-zinc-400 text-sm">
                {score >= 75 ? "Strong fit — expect to hear from us soon." : score >= 50 ? "Good potential — we'll take a closer look." : "We'll keep your profile on file."}
              </p>
            </motion.div>
          )}
          <Link href="/" className="inline-block text-zinc-500 text-sm hover:text-white transition-colors">← Back to Flux</Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-violet-600/8 blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-blue-600/8 blur-[100px]" />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-5">
        <Link href="/" className="text-2xl font-black gradient-text drop-shadow-lg">Flux</Link>
        <div className="flex items-center gap-3">
          <span className="text-zinc-600 text-sm hidden sm:block">{currentStep + 1} of {STEPS.length}</span>
          {currentStep > 0 && (
            <button onClick={handleBack} className="text-zinc-500 hover:text-white text-sm transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5">
              ← Back
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="relative z-10 px-4 sm:px-8">
        <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500"
            animate={{ width: `${progress}%` }} transition={{ duration: 0.4, ease: "easeOut" }} />
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-8 relative z-10">
        <div className="w-full max-w-xl">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div key={currentStep} custom={direction}
              initial={{ opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="space-y-8">
              <div className="space-y-3">
                <p className="text-zinc-600 text-xs font-mono">
                  {String(currentStep + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
                </p>
                <h2 className="text-2xl sm:text-3xl font-semibold leading-snug">{getQuestion()}</h2>
              </div>

              <div className="space-y-3">
                {step.type === "textarea" ? (
                  <textarea autoFocus rows={4} value={currentValue}
                    onChange={(e) => handleChange(step.field, e.target.value)}
                    placeholder={step.placeholder}
                    className="w-full bg-white/3 border border-white/8 rounded-2xl px-4 py-3.5 text-white placeholder-zinc-700 outline-none focus:border-violet-500/40 focus:bg-white/5 resize-none text-base transition-all leading-relaxed"
                    onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleNext(); }}
                  />
                ) : step.type === "select" ? (
                  <div className="flex flex-wrap gap-2">
                    {step.options!.map((opt, i) => {
                      const val = step.values ? step.values[i] : opt;
                      return (
                        <button key={opt} onClick={() => handleChange(step.field, val)}
                          className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                            currentValue === val
                              ? "border-violet-500/60 bg-violet-500/15 text-violet-200"
                              : "border-white/8 text-zinc-500 hover:border-white/15 hover:text-zinc-300 bg-white/2"
                          }`}>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input autoFocus type={step.type} value={currentValue}
                    onChange={(e) => handleChange(step.field, e.target.value)}
                    placeholder={step.placeholder}
                    className="w-full bg-white/3 border border-white/8 rounded-2xl px-4 py-3.5 text-white placeholder-zinc-700 outline-none focus:border-violet-500/40 focus:bg-white/5 text-base transition-all"
                    onKeyDown={(e) => { if (e.key === "Enter" && !step.subField) handleNext(); }}
                  />
                )}

                {step.subField && (
                  <input type="text" value={formData[step.subField.field] || ""}
                    onChange={(e) => handleChange(step.subField!.field, e.target.value)}
                    placeholder={step.subField.placeholder}
                    className="w-full bg-white/3 border border-white/8 rounded-2xl px-4 py-3.5 text-white placeholder-zinc-700 outline-none focus:border-violet-500/40 focus:bg-white/5 text-base transition-all"
                  />
                )}

                {step.extraField && (
                  <input type="text" value={formData[step.extraField.field] || ""}
                    onChange={(e) => handleChange(step.extraField!.field, e.target.value)}
                    placeholder={step.extraField.placeholder}
                    className="w-full bg-white/3 border border-white/8 rounded-2xl px-4 py-3.5 text-white placeholder-zinc-700 outline-none focus:border-violet-500/40 focus:bg-white/5 text-base transition-all"
                  />
                )}
              </div>

              {error && <p className="text-red-400 text-sm px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">{error}</p>}

              <div className="flex items-center justify-between">
                <button onClick={handleNext} disabled={!canProceed() || loading}
                  className="px-7 py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-semibold rounded-full disabled:opacity-25 hover:opacity-90 active:scale-95 transition-all text-sm shadow-lg shadow-violet-500/20">
                  {loading ? "Submitting..." : currentStep === STEPS.length - 1 ? "Submit application →" : "Continue →"}
                </button>
                {step.type === "textarea" && (
                  <p className="text-zinc-700 text-xs hidden sm:block">⌘ + Enter</p>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
