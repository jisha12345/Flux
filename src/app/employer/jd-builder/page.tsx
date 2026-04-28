"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { JobDescription } from "@/lib/types";

const SECTION_CONFIG = {
  responsibilities: { label: "Responsibilities", icon: "→", color: "text-violet-400", bg: "bg-violet-500/8 border-violet-500/15" },
  requirements:     { label: "Requirements",     icon: "✓", color: "text-blue-400",   bg: "bg-blue-500/8 border-blue-500/15" },
  nice_to_have:     { label: "Nice to have",     icon: "◇", color: "text-zinc-400",   bg: "bg-white/3 border-white/8" },
} as const;

function JDPreview({ jd }: { jd: JobDescription }) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-zinc-500 text-xs uppercase tracking-widest">{jd.department}</p>
          <h2 className="text-3xl font-bold text-white">{jd.title}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { val: jd.location, icon: "📍" },
            { val: jd.type,     icon: "⏱" },
            { val: jd.experience_range, icon: "💼" },
            { val: jd.ctc_range, icon: "💰" },
          ].filter(t => t.val).map(tag => (
            <span key={tag.val} className="flex items-center gap-1.5 px-3 py-1.5 glass rounded-full text-xs text-zinc-300">
              <span>{tag.icon}</span>{tag.val}
            </span>
          ))}
        </div>
      </div>

      {/* About */}
      {jd.about_role && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">About the role</h3>
          <p className="text-zinc-300 leading-relaxed text-[15px]">{jd.about_role}</p>
        </div>
      )}

      {/* AI expectations callout */}
      {jd.ai_expectations && (
        <div className="flex gap-3 p-4 bg-violet-500/8 border border-violet-500/20 rounded-2xl">
          <span className="text-xl shrink-0">🤖</span>
          <div>
            <p className="text-violet-300 text-xs font-semibold uppercase tracking-wider mb-1">AI at Flux</p>
            <p className="text-zinc-300 text-sm leading-relaxed">{jd.ai_expectations}</p>
          </div>
        </div>
      )}

      {/* Sections */}
      {(["responsibilities", "requirements", "nice_to_have"] as const).map(field => {
        const items = jd[field] as string[];
        if (!items?.length) return null;
        const cfg = SECTION_CONFIG[field];
        return (
          <div key={field} className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{cfg.label}</h3>
            <div className={`rounded-2xl border p-4 space-y-2.5 ${cfg.bg}`}>
              {items.map((item, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className={`${cfg.color} text-xs mt-0.5 shrink-0 font-bold`}>{cfg.icon}</span>
                  <p className="text-zinc-300 text-sm leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function JDEditor({ jd, onChange }: { jd: JobDescription; onChange: (f: keyof JobDescription, v: string | string[]) => void }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {(["title", "department", "location", "type", "experience_range", "ctc_range"] as const).map(field => (
          <div key={field} className="space-y-1.5">
            <label className="text-zinc-500 text-xs uppercase tracking-wider">{field.replace(/_/g, " ")}</label>
            <input type="text" value={jd[field] as string} onChange={e => onChange(field, e.target.value)}
              className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-violet-500/40 transition-all" />
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <label className="text-zinc-500 text-xs uppercase tracking-wider">About the role</label>
        <textarea rows={3} value={jd.about_role} onChange={e => onChange("about_role", e.target.value)}
          className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-violet-500/40 resize-none transition-all leading-relaxed" />
      </div>

      <div className="space-y-1.5">
        <label className="text-zinc-500 text-xs uppercase tracking-wider">AI expectations</label>
        <textarea rows={2} value={jd.ai_expectations} onChange={e => onChange("ai_expectations", e.target.value)}
          className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-violet-500/40 resize-none transition-all" />
      </div>

      {(["responsibilities", "requirements", "nice_to_have"] as const).map(field => {
        const cfg = SECTION_CONFIG[field];
        return (
          <div key={field} className="space-y-2">
            <label className="text-zinc-500 text-xs uppercase tracking-wider">{cfg.label}</label>
            <div className="space-y-2">
              {(jd[field] as string[]).map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className={`${cfg.color} text-xs shrink-0`}>{cfg.icon}</span>
                  <input type="text" value={item}
                    onChange={e => {
                      const updated = [...(jd[field] as string[])];
                      updated[i] = e.target.value;
                      onChange(field, updated);
                    }}
                    className="flex-1 bg-white/3 border border-white/8 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-violet-500/40 transition-all" />
                  <button onClick={() => onChange(field, (jd[field] as string[]).filter((_, idx) => idx !== i))}
                    className="text-zinc-700 hover:text-red-400 w-7 h-7 flex items-center justify-center text-lg transition-colors shrink-0">×</button>
                </div>
              ))}
              <button onClick={() => onChange(field, [...(jd[field] as string[]), ""])}
                className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors flex items-center gap-1 pl-5">
                + Add item
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function JDBuilder() {
  const [brief, setBrief] = useState("");
  const [jd, setJd] = useState<JobDescription | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [view, setView] = useState<"preview" | "edit">("preview");
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentLink, setAssessmentLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  async function generateJD() {
    if (!brief.trim()) return;
    setLoading(true);
    setError("");
    setSaved(false);
    setAssessmentLink("");
    try {
      const res = await fetch("/api/generate-jd", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Generation failed");
      setJd(data.jd);
      setView("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function generateAssessment() {
    if (!brief.trim() || !jd) return;
    setAssessmentLoading(true);
    setAssessmentLink("");
    try {
      const isTech = /engineer|developer|data|ml|ai|devops|architect|backend|frontend|fullstack|tech/i.test(jd.title + " " + jd.department);
      const res = await fetch("/api/generate-assessment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief, role: jd.title, department: jd.department, type: isTech ? "tech" : "non-tech", jd_content: jd }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setAssessmentLink(`${window.location.origin}/assessment/${data.assessment.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assessment generation failed.");
    } finally {
      setAssessmentLoading(false);
    }
  }

  function copyLink() {
    try { navigator.clipboard.writeText(assessmentLink); } catch {
      const el = document.createElement("textarea");
      el.value = assessmentLink;
      document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Sidebar */}
      <div className="hidden lg:flex w-60 border-r border-white/5 flex-col p-5 gap-5 shrink-0">
        <Link href="/" className="text-2xl font-black gradient-text drop-shadow-lg px-3">Flux</Link>
        <nav className="flex flex-col gap-1">
          <Link href="/employer/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-zinc-500 hover:text-white hover:bg-white/5 text-sm transition-all">
            <span>👥</span> Candidates
          </Link>
          <Link href="/employer/jd-builder" className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 text-white text-sm font-medium">
            <span>✍️</span> JD Builder
          </Link>
        </nav>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-8">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Link href="/employer/dashboard" className="lg:hidden text-zinc-500 hover:text-white transition-colors text-sm">←</Link>
            <div>
              <h1 className="text-2xl font-bold">JD Builder</h1>
              <p className="text-zinc-500 text-sm mt-0.5">Describe the role. Claude writes the JD.</p>
            </div>
          </div>

          {/* Input */}
          <div className="space-y-3">
            <textarea rows={4} value={brief} onChange={e => setBrief(e.target.value)}
              placeholder="e.g. Senior product manager for our growth team. Owns the seller acquisition funnel, works with engineering and data, comfortable using AI tools. 5-8 years, Bengaluru, hybrid."
              className="w-full bg-white/3 border border-white/8 rounded-2xl px-4 py-3.5 text-white placeholder-zinc-700 outline-none focus:border-violet-500/40 resize-none text-sm leading-relaxed transition-all"
            />
            {error && <p className="text-red-400 text-xs px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">{error}</p>}
            <button onClick={generateJD} disabled={loading || !brief.trim()}
              className="px-7 py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-semibold rounded-full disabled:opacity-30 hover:opacity-90 active:scale-95 transition-all text-sm shadow-lg shadow-violet-500/20">
              {loading ? "Generating..." : "Generate JD with AI →"}
            </button>
          </div>

          {/* JD Output */}
          <AnimatePresence>
            {jd && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className="glass rounded-3xl overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                  <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
                    {(["preview", "edit"] as const).map(v => (
                      <button key={v} onClick={() => setView(v)}
                        className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all capitalize ${view === v ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
                        {v === "preview" ? "Preview" : "Edit"}
                      </button>
                    ))}
                  </div>
                  {saved && <span className="text-green-400 text-xs">Saved ✓</span>}
                </div>

                {/* Content */}
                <div className="p-6 sm:p-8">
                  <AnimatePresence mode="wait">
                    {view === "preview" ? (
                      <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                        <JDPreview jd={jd} />
                      </motion.div>
                    ) : (
                      <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                        <JDEditor jd={jd} onChange={(f, v) => setJd(prev => prev ? { ...prev, [f]: v } : null)} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Footer actions */}
                <div className="px-6 sm:px-8 pb-6 sm:pb-8 space-y-4 border-t border-white/5 pt-5">
                  <div className="flex flex-wrap gap-3">
                    <button onClick={async () => {
                      if (!jd) return;
                      try {
                        const res = await fetch("/api/jd", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jd) });
                        const data = await res.json();
                        if (data.success) { setSaved(true); setSavedId(data.jd.id); }
                        else setError(data.error);
                      } catch { setError("Save failed"); }
                    }}
                      className="px-6 py-2.5 bg-white text-black font-semibold rounded-full hover:bg-zinc-100 active:scale-95 transition-all text-sm">
                      {saved ? "Saved ✓" : "Save JD"}
                    </button>
                    <button onClick={generateAssessment} disabled={assessmentLoading}
                      className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-semibold rounded-full hover:opacity-90 disabled:opacity-40 active:scale-95 transition-all text-sm">
                      {assessmentLoading ? "Generating test..." : "Generate screening test →"}
                    </button>
                  </div>

                  {assessmentLink && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-green-500/8 border border-green-500/15 rounded-2xl space-y-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                        <p className="text-green-400 text-sm font-medium">Screening test ready</p>
                      </div>
                      <p className="text-zinc-500 text-xs">Share this link with candidates to take the test:</p>
                      <div className="flex gap-2">
                        <input readOnly value={assessmentLink}
                          className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-zinc-300 text-xs font-mono outline-none min-w-0" />
                        <button onClick={copyLink}
                          className={`px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0 ${copied ? "bg-green-500/20 text-green-400 border border-green-500/20" : "bg-white/8 hover:bg-white/12 text-white border border-white/10"}`}>
                          {copied ? "✓ Copied" : "Copy"}
                        </button>
                      </div>
                    </motion.div>
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
