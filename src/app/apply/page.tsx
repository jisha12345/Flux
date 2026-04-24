"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const STEPS = [
  {
    id: "intro",
    question: "Hey. Before we get to the form — what's your name?",
    field: "full_name",
    placeholder: "Your full name",
    type: "text",
  },
  {
    id: "email",
    question: (name: string) => `Nice to meet you, ${name.split(" ")[0]}. What's your email?`,
    field: "email",
    placeholder: "you@example.com",
    type: "email",
  },
  {
    id: "phone",
    question: "Phone number?",
    field: "phone",
    placeholder: "+91 9876543210",
    type: "tel",
  },
  {
    id: "current_role",
    question: "What do you do right now? (Role + Company)",
    field: "current_role",
    placeholder: "e.g. Product Manager",
    type: "text",
    subField: { field: "current_company", placeholder: "Company name" },
  },
  {
    id: "experience",
    question: "How many years of experience do you have?",
    field: "total_experience",
    placeholder: "e.g. 4",
    type: "text",
  },
  {
    id: "ctc",
    question: "CTC — current and what you're looking for. (in LPA)",
    field: "current_ctc",
    placeholder: "Current CTC (e.g. 18 LPA)",
    type: "text",
    subField: { field: "expected_ctc", placeholder: "Expected CTC (e.g. 25 LPA)" },
  },
  {
    id: "notice",
    question: "What's your notice period?",
    field: "notice_period",
    type: "select",
    options: ["Immediate", "15 days", "1 month", "2 months", "3 months", "Serving notice"],
  },
  {
    id: "location",
    question: "Where are you based, and where are you open to?",
    field: "current_location",
    placeholder: "Current city",
    type: "text",
    subField: { field: "preferred_location", placeholder: "Preferred city / open to relocation" },
  },
  {
    id: "wfh",
    question: "How do you like to work?",
    field: "wfh_preference",
    type: "select",
    options: ["Remote only", "Hybrid is fine", "In-office, I like the energy"],
    values: ["remote", "hybrid", "office"],
  },
  {
    id: "ai_comfort",
    question: "On a scale of 1–10, how deeply are you using AI in your work right now? (1 = barely heard of it, 10 = it's basically my cofounder)",
    field: "ai_comfort_score",
    type: "select",
    options: ["1 — Just getting started", "2", "3", "4", "5 — Use it daily for basics", "6", "7", "8", "9", "10 — It's my cofounder"],
    values: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
  },
  {
    id: "ai_tools",
    question: "Which AI tools are actually part of your workflow? Be specific.",
    field: "ai_tools_used",
    placeholder: "e.g. Claude for code review, Cursor for dev, Midjourney for assets, custom GPT-4 pipeline for...",
    type: "textarea",
  },
  {
    id: "ai_project",
    question: "Tell us about something real you built or shipped using AI. Not a demo. Not a todo app. The real one.",
    field: "ai_project_built",
    placeholder: "What was the problem, what did you build, what happened after...",
    type: "textarea",
  },
  {
    id: "ai_vision",
    question: "If you joined us, how would AI change the way you do your job in the next 6 months?",
    field: "ai_future_vision",
    placeholder: "Paint us a picture...",
    type: "textarea",
  },
  {
    id: "ai_without",
    question: "Imagine tomorrow all your AI tools are gone. How does that make you feel?",
    field: "ai_without_tools_feeling",
    placeholder: "Honest answer...",
    type: "textarea",
  },
  {
    id: "biggest_build",
    question: "What's the most ambitious thing you've ever built or done — with or without AI?",
    field: "biggest_build",
    placeholder: "The one that still makes you proud...",
    type: "textarea",
  },
  {
    id: "why_us",
    question: "Why here, why now? (Skip the generic answer.)",
    field: "why_us",
    placeholder: "What specifically caught your attention...",
    type: "textarea",
  },
  {
    id: "links",
    question: "Drop your links — LinkedIn, GitHub, portfolio. Whatever represents you best.",
    field: "linkedin_url",
    placeholder: "LinkedIn URL",
    type: "text",
    subField: { field: "github_url", placeholder: "GitHub URL (optional)" },
    extraField: { field: "portfolio_url", placeholder: "Portfolio / website (optional)" },
  },
];

const STATUS_COLORS: Record<string, string> = {
  remote: "bg-green-500/20 text-green-300",
  hybrid: "bg-blue-500/20 text-blue-300",
  office: "bg-orange-500/20 text-orange-300",
};

export default function ApplyPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState("");

  const step = STEPS[currentStep];
  const progress = ((currentStep) / STEPS.length) * 100;

  const currentValue = formData[step.field] || "";

  function handleChange(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function canProceed() {
    if (!currentValue.trim()) return false;
    if (step.id === "ctc" && !formData["expected_ctc"]?.trim()) return false;
    if (step.id === "current_role" && !formData["current_company"]?.trim()) return false;
    if (step.id === "location" && !formData["preferred_location"]?.trim()) return false;
    return true;
  }

  async function handleNext() {
    if (!canProceed()) return;
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      await handleSubmit();
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
      if (!data.success) throw new Error(data.error);
      setScore(data.score);
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function getQuestion(): string {
    if (typeof step.question === "function") {
      return step.question(formData["full_name"] || "there");
    }
    return step.question;
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-lg text-center space-y-6"
        >
          <div className="text-6xl">🎉</div>
          <h1 className="text-3xl font-bold">You're in the pile.</h1>
          <p className="text-zinc-400 text-lg">
            We read every application ourselves. If there's a fit, you'll hear from us within a week.
          </p>
          {score !== null && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-2">
              <p className="text-zinc-500 text-sm uppercase tracking-wider">Your match score</p>
              <p className="text-5xl font-bold text-white">{score}<span className="text-zinc-500 text-2xl">/100</span></p>
              <p className="text-zinc-400 text-sm">
                {score >= 75 ? "Strong fit — expect to hear from us soon." : score >= 50 ? "Good potential — we'll take a closer look." : "We'll keep your profile on file."}
              </p>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-0.5 bg-zinc-900 z-50">
        <motion.div
          className="h-full bg-white"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-xl">
          {/* Step counter */}
          <p className="text-zinc-600 text-sm mb-8">
            {currentStep + 1} / {STEPS.length}
          </p>

          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-medium leading-snug text-white">
                {getQuestion()}
              </h2>

              <div className="space-y-3">
                {step.type === "textarea" ? (
                  <textarea
                    autoFocus
                    rows={4}
                    value={currentValue}
                    onChange={(e) => handleChange(step.field, e.target.value)}
                    placeholder={step.placeholder}
                    className="w-full bg-transparent border-b border-zinc-700 focus:border-white outline-none text-white placeholder-zinc-600 resize-none py-2 text-lg transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.metaKey) handleNext();
                    }}
                  />
                ) : step.type === "select" ? (
                  <div className="flex flex-wrap gap-2">
                    {step.options!.map((opt, i) => {
                      const val = step.values ? step.values[i] : opt;
                      return (
                        <button
                          key={opt}
                          onClick={() => handleChange(step.field, val)}
                          className={`px-4 py-2 rounded-full border text-sm transition-all ${
                            currentValue === val
                              ? "border-white bg-white text-black font-medium"
                              : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    autoFocus
                    type={step.type}
                    value={currentValue}
                    onChange={(e) => handleChange(step.field, e.target.value)}
                    placeholder={step.placeholder}
                    className="w-full bg-transparent border-b border-zinc-700 focus:border-white outline-none text-white placeholder-zinc-600 py-2 text-lg transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !step.subField) handleNext();
                    }}
                  />
                )}

                {step.subField && (
                  <input
                    type="text"
                    value={formData[step.subField.field] || ""}
                    onChange={(e) => handleChange(step.subField!.field, e.target.value)}
                    placeholder={step.subField.placeholder}
                    className="w-full bg-transparent border-b border-zinc-700 focus:border-white outline-none text-white placeholder-zinc-600 py-2 text-lg transition-colors"
                  />
                )}

                {step.extraField && (
                  <input
                    type="text"
                    value={formData[step.extraField.field] || ""}
                    onChange={(e) => handleChange(step.extraField!.field, e.target.value)}
                    placeholder={step.extraField.placeholder}
                    className="w-full bg-transparent border-b border-zinc-700 focus:border-white outline-none text-white placeholder-zinc-600 py-2 text-lg transition-colors"
                  />
                )}
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <div className="flex items-center gap-4 pt-2">
                <button
                  onClick={handleNext}
                  disabled={!canProceed() || loading}
                  className="px-6 py-2.5 bg-white text-black font-medium rounded-full disabled:opacity-30 hover:bg-zinc-100 transition-all text-sm"
                >
                  {loading ? "Submitting..." : currentStep === STEPS.length - 1 ? "Submit application →" : "Next →"}
                </button>
                {step.type === "textarea" && (
                  <p className="text-zinc-600 text-xs">⌘ + Enter to continue</p>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
