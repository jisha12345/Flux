"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { CandidateApplication } from "@/lib/types";

const STATUS_OPTIONS = ["new", "shortlisted", "interview", "offer", "rejected"] as const;
const STATUS_STYLES: Record<string, string> = {
  new: "bg-zinc-800 text-zinc-300",
  shortlisted: "bg-blue-500/15 text-blue-300 border border-blue-500/20",
  interview: "bg-yellow-500/15 text-yellow-300 border border-yellow-500/20",
  offer: "bg-green-500/15 text-green-300 border border-green-500/20",
  rejected: "bg-red-500/15 text-red-300 border border-red-500/20",
};

function ScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#6366f1";
  return (
    <div className="relative w-10 h-10 shrink-0">
      <svg className="w-full h-full" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#27272a" strokeWidth="3" />
        <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${score} 100`} strokeLinecap="round" className="score-ring" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
      {initials}
    </div>
  );
}

export default function Dashboard() {
  const [candidates, setCandidates] = useState<CandidateApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CandidateApplication | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [filters, setFilters] = useState({ search: "", min_score: "0", status: "", wfh: "" });

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.min_score) params.set("min_score", filters.min_score);
    if (filters.status) params.set("status", filters.status);
    if (filters.wfh) params.set("wfh", filters.wfh);
    const res = await fetch(`/api/candidates?${params}`);
    const data = await res.json();
    setCandidates(data.candidates || []);
    setLoading(false);
  }, [filters]);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  async function updateStatus(id: string, status: string) {
    await fetch("/api/candidates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    fetchCandidates();
    if (selected?.id === id) setSelected(s => s ? { ...s, status: status as CandidateApplication["status"] } : null);
  }

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <>
      <Link href="/employer/dashboard" onClick={onClick} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 text-white text-sm font-medium">
        <span>👥</span> Candidates
      </Link>
      <Link href="/employer/jd-builder" onClick={onClick} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-zinc-500 hover:text-white hover:bg-white/5 text-sm transition-all">
        <span>✍️</span> JD Builder
      </Link>
    </>
  );

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-60 border-r border-white/5 flex-col p-5 gap-5 shrink-0">
        <Link href="/" className="text-xl font-bold gradient-text px-3">Flux</Link>
        <nav className="flex flex-col gap-1"><NavLinks /></nav>
        <div className="mt-auto px-3 text-zinc-600 text-xs">{candidates.length} candidates</div>
      </div>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 bg-black/80 z-40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
            <motion.div initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }} transition={{ type: "spring", damping: 28, stiffness: 200 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-60 bg-zinc-950 border-r border-white/5 z-50 p-5 flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <Link href="/" className="text-xl font-bold gradient-text">Flux</Link>
                <button onClick={() => setSidebarOpen(false)} className="text-zinc-500 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5">✕</button>
              </div>
              <nav className="flex flex-col gap-1"><NavLinks onClick={() => setSidebarOpen(false)} /></nav>
              <div className="mt-auto text-zinc-600 text-xs">{candidates.length} candidates</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="border-b border-white/5 px-4 sm:px-6 h-14 flex items-center gap-3 shrink-0">
          <button className="lg:hidden text-zinc-400 hover:text-white p-1" onClick={() => setSidebarOpen(true)}>
            <div className="space-y-1"><div className="w-5 h-0.5 bg-current rounded" /><div className="w-5 h-0.5 bg-current rounded" /><div className="w-4 h-0.5 bg-current rounded" /></div>
          </button>
          <h1 className="font-semibold">Candidates</h1>
          <span className="ml-auto text-zinc-600 text-xs">{candidates.length} total</span>
        </div>

        {/* Filters */}
        <div className="border-b border-white/5 px-4 sm:px-6 py-3 flex items-center gap-2 flex-wrap shrink-0">
          <input type="text" placeholder="Search name, role, skills..." value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            className="bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-500/40 w-full sm:w-52 transition-all"
          />
          <select value={filters.min_score} onChange={(e) => setFilters(f => ({ ...f, min_score: e.target.value }))}
            className="bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white outline-none flex-1 sm:flex-none min-w-0">
            <option value="0">All scores</option>
            <option value="50">50+</option>
            <option value="70">70+</option>
            <option value="85">85+</option>
          </select>
          <select value={filters.status} onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
            className="bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white outline-none flex-1 sm:flex-none min-w-0">
            <option value="">All stages</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.wfh} onChange={(e) => setFilters(f => ({ ...f, wfh: e.target.value }))}
            className="bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white outline-none flex-1 sm:flex-none min-w-0">
            <option value="">Any WFH</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="office">In-office</option>
          </select>
          <button onClick={fetchCandidates}
            className="px-4 py-2 bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-medium rounded-xl hover:opacity-90 active:scale-95 transition-all shrink-0">
            Search
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* List — hidden on mobile when detail is open */}
          <div className={`${showDetail ? "hidden lg:flex" : "flex"} flex-col w-full lg:w-96 border-r border-white/5 overflow-y-auto shrink-0`}>
            {loading ? (
              <div className="p-4 space-y-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="animate-pulse flex gap-3 p-3 rounded-xl bg-white/2">
                    <div className="w-9 h-9 rounded-full bg-zinc-800 shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3 bg-zinc-800 rounded w-3/4" />
                      <div className="h-2 bg-zinc-900 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : candidates.length === 0 ? (
              <div className="p-8 text-center text-zinc-600 text-sm">No candidates found.</div>
            ) : (
              <div>
                {candidates.map((c) => (
                  <button key={c.id} onClick={() => { setSelected(c); setShowDetail(true); }}
                    className={`w-full text-left p-4 border-b border-white/5 transition-colors flex items-start gap-3 ${selected?.id === c.id ? "bg-white/5" : "hover:bg-white/3"}`}>
                    <Avatar name={c.full_name} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-white truncate">{c.full_name}</p>
                      <p className="text-zinc-500 text-xs truncate mt-0.5">{c.current_role} · {c.current_company}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[c.status || "new"]}`}>{c.status || "new"}</span>
                        <span className="text-zinc-700 text-xs">{c.notice_period}</span>
                      </div>
                    </div>
                    <ScoreRing score={c.score || 0} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          <AnimatePresence>
            {selected && showDetail && (
              <motion.div key={selected.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }} className="flex-1 overflow-y-auto p-4 sm:p-6">
                <button onClick={() => { setShowDetail(false); }}
                  className="lg:hidden flex items-center gap-2 text-zinc-500 hover:text-white text-sm mb-5 transition-colors">
                  ← Back
                </button>

                <div className="max-w-2xl space-y-6">
                  <div className="flex items-start gap-4">
                    <Avatar name={selected.full_name} />
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl font-bold truncate">{selected.full_name}</h2>
                      <p className="text-zinc-400 text-sm">{selected.current_role} at {selected.current_company}</p>
                      <p className="text-zinc-600 text-xs mt-0.5">{selected.email}</p>
                    </div>
                    <div className="relative w-14 h-14 shrink-0">
                      <svg className="w-full h-full" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#27272a" strokeWidth="2.5" />
                        <circle cx="18" cy="18" r="15.9" fill="none"
                          stroke={(selected.score || 0) >= 75 ? "#22c55e" : (selected.score || 0) >= 50 ? "#f59e0b" : "#6366f1"}
                          strokeWidth="2.5" strokeDasharray={`${selected.score || 0} 100`} strokeLinecap="round" className="score-ring" />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-sm font-bold">{selected.score}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status buttons */}
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-zinc-600 text-xs w-full sm:w-auto">Move to:</span>
                    {STATUS_OPTIONS.map((s) => (
                      <button key={s} onClick={() => updateStatus(selected.id!, s)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-all ${selected.status === s ? STATUS_STYLES[s] + " font-semibold" : "border-white/8 text-zinc-600 hover:text-white hover:border-white/15"}`}>
                        {s}
                      </button>
                    ))}
                  </div>

                  {/* Score breakdown */}
                  {selected.score_breakdown && (
                    <div className="glass rounded-2xl p-5 space-y-4">
                      <p className="text-sm font-medium text-zinc-300">AI Score Breakdown</p>
                      {[
                        { label: "AI Depth", val: selected.score_breakdown.ai_depth, max: 25 },
                        { label: "Communication", val: selected.score_breakdown.communication, max: 25 },
                        { label: "Experience Relevance", val: selected.score_breakdown.experience_relevance, max: 25 },
                        { label: "Ambition", val: selected.score_breakdown.ambition, max: 25 },
                      ].map((item) => (
                        <div key={item.label} className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-400">{item.label}</span>
                            <span className="text-zinc-600">{item.val}/{item.max}</span>
                          </div>
                          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${(item.val / item.max) * 100}%` }}
                              transition={{ duration: 0.6, ease: "easeOut" }}
                              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500" />
                          </div>
                        </div>
                      ))}
                      <p className="text-zinc-400 text-sm pt-2 border-t border-white/5 leading-relaxed">{selected.score_breakdown.summary}</p>
                    </div>
                  )}

                  {/* Quick facts */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: "Current CTC", val: selected.current_ctc },
                      { label: "Expected CTC", val: selected.expected_ctc },
                      { label: "Notice", val: selected.notice_period },
                      { label: "Experience", val: `${selected.total_experience}y` },
                      { label: "Location", val: selected.current_location },
                      { label: "Prefers", val: selected.preferred_location },
                      { label: "WFH", val: selected.wfh_preference },
                      { label: "AI Score", val: `${selected.ai_comfort_score}/10` },
                    ].map((item) => (
                      <div key={item.label} className="glass rounded-xl p-3">
                        <p className="text-zinc-600 text-xs">{item.label}</p>
                        <p className="text-white text-sm font-medium mt-0.5 truncate">{item.val}</p>
                      </div>
                    ))}
                  </div>

                  {/* Long answers */}
                  {[
                    { label: "AI tools used", val: selected.ai_tools_used },
                    { label: "Built with AI", val: selected.ai_project_built },
                    { label: "AI vision", val: selected.ai_future_vision },
                    { label: "Without AI", val: selected.ai_without_tools_feeling },
                    { label: "Biggest build", val: selected.biggest_build },
                    { label: "Why us", val: selected.why_us },
                  ].map((item) => item.val ? (
                    <div key={item.label} className="space-y-1.5">
                      <p className="text-zinc-600 text-xs uppercase tracking-wider">{item.label}</p>
                      <p className="text-zinc-300 text-sm leading-relaxed">{item.val}</p>
                    </div>
                  ) : null)}

                  {/* Links */}
                  <div className="flex gap-3 flex-wrap pt-2 pb-8">
                    {selected.linkedin_url && <a href={selected.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-sm px-4 py-2 glass glass-hover rounded-xl text-blue-400">LinkedIn ↗</a>}
                    {selected.github_url && <a href={selected.github_url} target="_blank" rel="noopener noreferrer" className="text-sm px-4 py-2 glass glass-hover rounded-xl text-zinc-400">GitHub ↗</a>}
                    {selected.portfolio_url && <a href={selected.portfolio_url} target="_blank" rel="noopener noreferrer" className="text-sm px-4 py-2 glass glass-hover rounded-xl text-zinc-400">Portfolio ↗</a>}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!selected && (
            <div className="hidden lg:flex flex-1 items-center justify-center text-zinc-700 text-sm">
              Select a candidate to view their profile
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
