"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { use } from "react";

interface Question {
  id: number;
  type: "mcq" | "written" | "coding";
  section: string;
  question: string;
  options?: string[];
  points: number;
  hint?: string;
}

interface Assessment {
  id: string;
  title: string;
  role: string;
  department: string;
  assessment_type: string;
  time_limit_minutes: number;
  questions: Question[];
}

type Phase = "intro" | "info" | "test" | "submitted";

export default function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; max_score: number } | null>(null);
  const [error, setError] = useState("");
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    fetch(`/api/assessment?id=${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) { setAssessment(d.assessment); setTimeLeft(d.assessment.time_limit_minutes * 60); }
        else setError("Assessment not found or no longer active.");
      })
      .catch(() => setError("Failed to load assessment."))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = useCallback(async () => {
    if (!assessment || submitting) return;
    setSubmitting(true);
    const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
    const answersArray = assessment.questions.map(q => ({ id: q.id, answer: answers[q.id] || "" }));
    try {
      const res = await fetch("/api/assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessment_id: id, candidate_name: name, candidate_email: email, answers: answersArray, time_taken_seconds: elapsed }),
      });
      const data = await res.json();
      if (data.success) { setResult({ score: data.score, max_score: data.max_score }); setPhase("submitted"); }
      else setError(data.error || "Submission failed");
    } catch { setError("Submission failed. Please try again."); }
    finally { setSubmitting(false); }
  }, [assessment, submitting, answers, id, name, email]);

  // Timer
  useEffect(() => {
    if (phase !== "test") return;
    if (timeLeft <= 0) { handleSubmit(); return; }
    const t = setInterval(() => setTimeLeft(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [phase, timeLeft, handleSubmit]);

  function startTest() {
    startTimeRef.current = Date.now();
    setPhase("test");
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  const answered = assessment ? Object.keys(answers).length : 0;
  const total = assessment?.questions.length || 0;
  const progress = total > 0 ? (answered / total) * 100 : 0;
  const q = assessment?.questions[currentQ];

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6 text-center">
      <div><p className="text-zinc-500 text-lg">{error}</p></div>
    </div>
  );

  if (phase === "submitted") return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-violet-600/10 blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-blue-600/10 blur-[100px]" />
      </div>
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full text-center space-y-8 relative z-10">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring" }} className="text-6xl">🎯</motion.div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Assessment submitted</h1>
          <p className="text-zinc-400">Thanks {name.split(" ")[0]}. We&apos;ll be in touch.</p>
        </div>
        {result && (
          <div className="glass rounded-2xl p-8 space-y-4">
            <p className="text-zinc-500 text-sm uppercase tracking-wider">Your score</p>
            <div className="relative w-28 h-28 mx-auto">
              <svg className="w-full h-full" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#27272a" strokeWidth="2.5" />
                <circle cx="18" cy="18" r="15.9" fill="none"
                  stroke={result.score >= 75 ? "#22c55e" : result.score >= 50 ? "#f59e0b" : "#6366f1"}
                  strokeWidth="2.5" strokeDasharray={`${result.score} 100`} strokeLinecap="round"
                  style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-bold">{result.score}</span>
              </div>
            </div>
            <p className="text-zinc-400 text-sm">
              {result.score >= 75 ? "Excellent — strong performance." : result.score >= 50 ? "Good — team will review." : "Submitted — team will be in touch."}
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );

  if (phase === "intro") return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full bg-violet-600/10 blur-[120px]" />
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg w-full space-y-8 relative z-10">
        <div className="text-2xl font-black gradient-text">Flux</div>
        <div className="space-y-3">
          <div className="text-zinc-500 text-xs uppercase tracking-wider">{assessment?.role} · {assessment?.department}</div>
          <h1 className="text-3xl font-bold">{assessment?.title}</h1>
          <p className="text-zinc-400">A short screening assessment. Answer honestly — there&apos;s no trick to gaming it.</p>
        </div>
        <div className="glass rounded-2xl p-6 space-y-3">
          {[
            { label: "Questions", val: `${total}` },
            { label: "Time limit", val: `${assessment?.time_limit_minutes} minutes` },
            { label: "Type", val: assessment?.assessment_type === "tech" ? "Technical + Situational" : "Domain + Situational" },
            { label: "Scoring", val: "Auto-scored with AI review" },
          ].map(row => (
            <div key={row.label} className="flex justify-between text-sm">
              <span className="text-zinc-500">{row.label}</span>
              <span className="text-white">{row.val}</span>
            </div>
          ))}
        </div>
        <button onClick={() => setPhase("info")}
          className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-semibold rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-violet-500/20">
          Start assessment →
        </button>
      </motion.div>
    </div>
  );

  if (phase === "info") return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-sm w-full space-y-6 relative z-10">
        <div className="text-2xl font-black gradient-text">Flux</div>
        <div>
          <h2 className="text-2xl font-bold">Before we start</h2>
          <p className="text-zinc-500 text-sm mt-1">So we know who to contact.</p>
        </div>
        <div className="space-y-3">
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name"
            className="w-full bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-white placeholder-zinc-700 outline-none focus:border-violet-500/40 text-sm" />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
            className="w-full bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-white placeholder-zinc-700 outline-none focus:border-violet-500/40 text-sm" />
        </div>
        <button onClick={startTest} disabled={!name.trim() || !email.trim()}
          className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-semibold rounded-xl hover:opacity-90 disabled:opacity-30 transition-all">
          Begin →
        </button>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-white/5 px-4 sm:px-8 h-14 flex items-center gap-4 shrink-0">
        <span className="text-lg font-black gradient-text">Flux</span>
        <div className="flex-1 mx-4">
          <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full"
              animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
          </div>
        </div>
        <div className={`text-sm font-mono font-medium tabular-nums ${timeLeft < 300 ? "text-red-400" : "text-zinc-400"}`}>
          {formatTime(timeLeft)}
        </div>
        <span className="text-zinc-600 text-sm">{currentQ + 1}/{total}</span>
      </div>

      {/* Question */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-8">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            {q && (
              <motion.div key={currentQ} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.22 }} className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-600 text-xs font-mono">{String(currentQ + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}</span>
                    <span className="text-zinc-700 text-xs">·</span>
                    <span className="text-zinc-600 text-xs">{q.section}</span>
                    <span className="text-zinc-700 text-xs">·</span>
                    <span className="text-zinc-600 text-xs">{q.points} pts</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-semibold leading-snug">{q.question}</h2>
                  {q.hint && <p className="text-zinc-600 text-sm italic">{q.hint}</p>}
                </div>

                {q.type === "mcq" && q.options ? (
                  <div className="space-y-2.5">
                    {q.options.map((opt) => (
                      <button key={opt} onClick={() => setAnswers(a => ({ ...a, [q.id]: opt.charAt(0) }))}
                        className={`w-full text-left px-4 py-3.5 rounded-xl border text-sm transition-all ${
                          answers[q.id] === opt.charAt(0)
                            ? "border-violet-500/60 bg-violet-500/15 text-violet-200"
                            : "border-white/8 text-zinc-300 hover:border-white/15 hover:bg-white/3"
                        }`}>
                        {opt}
                      </button>
                    ))}
                  </div>
                ) : (
                  <textarea rows={6} value={answers[q.id] || ""} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                    placeholder={q.type === "coding" ? "Describe your approach / write your solution..." : "Your answer..."}
                    className="w-full bg-white/3 border border-white/8 rounded-2xl px-4 py-3.5 text-white placeholder-zinc-700 outline-none focus:border-violet-500/40 resize-none text-sm leading-relaxed transition-all"
                  />
                )}

                {error && <p className="text-red-400 text-sm px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">{error}</p>}

                <div className="flex items-center justify-between pt-2">
                  <button onClick={() => setCurrentQ(q => Math.max(0, q - 1))} disabled={currentQ === 0}
                    className="px-5 py-2.5 glass rounded-xl text-sm text-zinc-400 hover:text-white disabled:opacity-20 transition-all">
                    ← Back
                  </button>
                  {currentQ < total - 1 ? (
                    <button onClick={() => setCurrentQ(q => q + 1)}
                      className="px-7 py-2.5 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-semibold rounded-xl hover:opacity-90 active:scale-95 transition-all text-sm">
                      Next →
                    </button>
                  ) : (
                    <button onClick={handleSubmit} disabled={submitting}
                      className="px-7 py-2.5 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-semibold rounded-xl hover:opacity-90 active:scale-95 disabled:opacity-40 transition-all text-sm">
                      {submitting ? "Submitting..." : "Submit →"}
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
