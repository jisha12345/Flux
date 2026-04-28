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

function WarningModal({ count, onDismiss }: { count: number; onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/90 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-zinc-950 border border-red-500/30 rounded-3xl p-8 max-w-sm w-full text-center space-y-5">
        <div className="text-5xl">⚠️</div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Integrity warning</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            A tab switch or focus loss was detected. This has been recorded.
          </p>
          <p className="text-red-400 text-xs font-medium">Violation {count} of 5 — after 5, your test is auto-submitted.</p>
        </div>
        <button onClick={onDismiss}
          className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-semibold rounded-xl hover:opacity-90 transition-all text-sm">
          I understand — return to test
        </button>
      </motion.div>
    </div>
  );
}

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

  // Anti-cheat state
  const [violations, setViolations] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const violationsRef = useRef(0);
  const MAX_VIOLATIONS = 5;

  useEffect(() => {
    fetch(`/api/assessment?id=${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const shuffle = <T,>(arr: T[]): T[] => {
            const a = [...arr];
            for (let i = a.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
          };
          const shuffledQs = (shuffle(d.assessment.questions) as Question[]).map((q: Question) => ({
            ...q,
            options: q.options ? shuffle(q.options) : undefined,
          }));
          setAssessment({ ...d.assessment, questions: shuffledQs });
          setTimeLeft(d.assessment.time_limit_minutes * 60);
        } else setError("Assessment not found or no longer active.");
      })
      .catch(() => setError("Failed to load assessment."))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = useCallback(async (autoSubmit = false) => {
    if (!assessment || submitting) return;
    setSubmitting(true);
    const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
    const answersArray = assessment.questions.map(q => ({ id: q.id, answer: answers[q.id] || "" }));
    try {
      const res = await fetch("/api/assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessment_id: id,
          candidate_name: name,
          candidate_email: email,
          answers: answersArray,
          time_taken_seconds: elapsed,
          violations_count: violationsRef.current,
          flagged: autoSubmit || violationsRef.current >= MAX_VIOLATIONS,
        }),
      });
      const data = await res.json();
      if (data.success) { setResult({ score: data.score, max_score: data.max_score }); setPhase("submitted"); }
      else setError(data.error || "Submission failed");
    } catch { setError("Submission failed. Please try again."); }
    finally { setSubmitting(false); }
  }, [assessment, submitting, answers, id, name, email]);

  // Anti-cheat: tab switch + focus loss
  useEffect(() => {
    if (phase !== "test") return;

    const handleViolation = () => {
      violationsRef.current += 1;
      setViolations(v => v + 1);
      setShowWarning(true);
      if (violationsRef.current >= MAX_VIOLATIONS) handleSubmit(true);
    };

    const onVisibilityChange = () => { if (document.hidden) handleViolation(); };
    const onBlur = () => handleViolation();

    // Block keyboard shortcuts
    const onKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const blocked = ctrl && ["c", "v", "a", "u", "s", "p", "f"].includes(e.key.toLowerCase());
      const devTools = e.key === "F12" || (ctrl && e.shiftKey && ["i", "j", "c", "k"].includes(e.key.toLowerCase()));
      if (blocked || devTools) e.preventDefault();
    };

    // Block right-click
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("contextmenu", onContextMenu);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [phase, handleSubmit]);

  // Timer
  useEffect(() => {
    if (phase !== "test") return;
    if (timeLeft <= 0) { handleSubmit(false); return; }
    const t = setInterval(() => setTimeLeft(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [phase, timeLeft, handleSubmit]);

  function startTest() {
    // Request fullscreen
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen();
      else if ((el as HTMLElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen)
        (el as HTMLElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen?.();
    } catch { /* fullscreen optional */ }
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
      <p className="text-zinc-500 text-lg">{error}</p>
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
          <h1 className="text-3xl font-bold">Test submitted</h1>
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
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold leading-none">{result.score}</span>
                <span className="text-zinc-600 text-xs leading-none mt-0.5">/100</span>
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
          <p className="text-zinc-400">A short screening test. Answer honestly — there&apos;s no trick to gaming it.</p>
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
        <div className="glass rounded-2xl p-4 space-y-2 border border-amber-500/20 bg-amber-500/5">
          <p className="text-amber-400 text-sm font-semibold">Before you begin</p>
          <ul className="text-zinc-400 text-xs space-y-1 list-none">
            <li>· Do not switch tabs or leave this window — it is monitored</li>
            <li>· AI tools and external resources are not permitted</li>
            <li>· Copy-paste and right-click are disabled during the test</li>
            <li>· Tab switches are recorded and flagged to the recruiter</li>
          </ul>
        </div>
        <button onClick={() => setPhase("info")}
          className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-semibold rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-violet-500/20">
          I understand — start test →
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
    <div className="min-h-screen bg-black text-white flex flex-col select-none">
      {/* Warning modal */}
      <AnimatePresence>
        {showWarning && <WarningModal count={violations} onDismiss={() => setShowWarning(false)} />}
      </AnimatePresence>

      {/* Header */}
      <div className="border-b border-white/5 px-4 sm:px-8 h-14 flex items-center gap-4 shrink-0">
        <span className="text-lg font-black gradient-text">Flux</span>
        <div className="flex-1 mx-4">
          <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full"
              animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
          </div>
        </div>
        {violations > 0 && (
          <span className="text-red-400 text-xs font-medium hidden sm:block">{violations} violation{violations > 1 ? "s" : ""}</span>
        )}
        <div className={`text-sm font-mono font-medium tabular-nums ${timeLeft < 120 ? "text-red-400" : timeLeft < 300 ? "text-amber-400" : "text-zinc-400"}`}>
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
                  {/* Question text — no selection */}
                  <h2 className="text-xl sm:text-2xl font-semibold leading-snug pointer-events-none">{q.question}</h2>
                  {q.hint && <p className="text-zinc-600 text-sm italic pointer-events-none">{q.hint}</p>}
                </div>

                {q.type === "mcq" && q.options ? (
                  <div className="space-y-2.5">
                    {q.options.map(opt => (
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
                  <textarea rows={6}
                    value={answers[q.id] || ""}
                    onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                    onPaste={e => e.preventDefault()}
                    placeholder={q.type === "coding" ? "Describe your approach..." : "Your answer..."}
                    className="w-full bg-white/3 border border-white/8 rounded-2xl px-4 py-3.5 text-white placeholder-zinc-700 outline-none focus:border-violet-500/40 resize-none text-sm leading-relaxed transition-all select-text"
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
                    <button onClick={() => handleSubmit(false)} disabled={submitting}
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
