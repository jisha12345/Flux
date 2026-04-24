"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { CandidateApplication } from "@/lib/types";

const STATUS_OPTIONS = ["new", "shortlisted", "interview", "offer", "rejected"] as const;
const STATUS_COLORS: Record<string, string> = {
  new: "bg-zinc-800 text-zinc-300",
  shortlisted: "bg-blue-900/50 text-blue-300",
  interview: "bg-yellow-900/50 text-yellow-300",
  offer: "bg-green-900/50 text-green-300",
  rejected: "bg-red-900/50 text-red-300",
};

export default function Dashboard() {
  const [candidates, setCandidates] = useState<CandidateApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CandidateApplication | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    min_score: "0",
    status: "",
    wfh: "",
    notice: "",
  });

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

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  async function updateStatus(id: string, status: string) {
    await fetch("/api/candidates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    fetchCandidates();
    if (selected?.id === id) setSelected((s) => s ? { ...s, status: status as CandidateApplication["status"] } : null);
  }

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Sidebar */}
      <div className="w-64 border-r border-zinc-900 p-6 flex flex-col gap-6 shrink-0">
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-widest mb-1">Recruiter Portal</p>
          <p className="text-white font-semibold">Dashboard</p>
        </div>
        <nav className="space-y-1">
          {[
            { label: "Candidates", href: "/employer/dashboard", active: true },
            { label: "JD Builder", href: "/employer/jd-builder", active: false },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                item.active ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-white hover:bg-zinc-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto text-zinc-600 text-xs">{candidates.length} candidates total</div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Filters bar */}
        <div className="border-b border-zinc-900 p-4 flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Search name, role, company, skills..."
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-zinc-600 w-64"
          />
          <select
            value={filters.min_score}
            onChange={(e) => setFilters((f) => ({ ...f, min_score: e.target.value }))}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white outline-none"
          >
            <option value="0">All scores</option>
            <option value="50">Score 50+</option>
            <option value="70">Score 70+</option>
            <option value="85">Score 85+</option>
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white outline-none"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={filters.wfh}
            onChange={(e) => setFilters((f) => ({ ...f, wfh: e.target.value }))}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white outline-none"
          >
            <option value="">Any WFH</option>
            <option value="remote">Remote only</option>
            <option value="hybrid">Hybrid</option>
            <option value="office">In-office</option>
          </select>
          <button
            onClick={fetchCandidates}
            className="px-4 py-1.5 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-100 transition-all"
          >
            Search
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Candidate list */}
          <div className="w-96 border-r border-zinc-900 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-zinc-500 text-sm">Loading...</div>
            ) : candidates.length === 0 ? (
              <div className="p-6 text-zinc-500 text-sm">No candidates found.</div>
            ) : (
              candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className={`w-full text-left p-4 border-b border-zinc-900 hover:bg-zinc-900/50 transition-colors ${
                    selected?.id === c.id ? "bg-zinc-900" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-white truncate">{c.full_name}</p>
                      <p className="text-zinc-500 text-sm truncate">{c.current_role} · {c.current_company}</p>
                      <p className="text-zinc-600 text-xs mt-1">{c.current_location} · {c.notice_period} notice</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        (c.score || 0) >= 75 ? "bg-green-900/50 text-green-300" :
                        (c.score || 0) >= 50 ? "bg-yellow-900/50 text-yellow-300" :
                        "bg-zinc-800 text-zinc-400"
                      }`}>
                        {c.score}/100
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status || "new"]}`}>
                        {c.status || "new"}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Candidate detail */}
          <div className="flex-1 overflow-y-auto p-6">
            {!selected ? (
              <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
                Select a candidate to view their profile
              </div>
            ) : (
              <div className="max-w-2xl space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">{selected.full_name}</h2>
                    <p className="text-zinc-400">{selected.current_role} at {selected.current_company}</p>
                    <p className="text-zinc-500 text-sm mt-1">{selected.email} · {selected.phone}</p>
                  </div>
                  <div className="text-right space-y-2">
                    <div className={`text-2xl font-bold ${
                      (selected.score || 0) >= 75 ? "text-green-400" :
                      (selected.score || 0) >= 50 ? "text-yellow-400" : "text-zinc-400"
                    }`}>
                      {selected.score}<span className="text-zinc-600 text-base">/100</span>
                    </div>
                    <select
                      value={selected.status || "new"}
                      onChange={(e) => updateStatus(selected.id!, e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white outline-none"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {selected.score_breakdown && (
                  <div className="bg-zinc-900 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-medium text-zinc-300">AI Score Breakdown</p>
                    {[
                      { label: "AI Depth", val: selected.score_breakdown.ai_depth, max: 25 },
                      { label: "Communication", val: selected.score_breakdown.communication, max: 25 },
                      { label: "Experience Relevance", val: selected.score_breakdown.experience_relevance, max: 25 },
                      { label: "Ambition", val: selected.score_breakdown.ambition, max: 25 },
                    ].map((item) => (
                      <div key={item.label} className="space-y-1">
                        <div className="flex justify-between text-xs text-zinc-500">
                          <span>{item.label}</span>
                          <span>{item.val}/{item.max}</span>
                        </div>
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-white rounded-full"
                            style={{ width: `${(item.val / item.max) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    <p className="text-zinc-400 text-sm pt-1 border-t border-zinc-800">
                      {selected.score_breakdown.summary}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Current CTC", val: selected.current_ctc },
                    { label: "Expected CTC", val: selected.expected_ctc },
                    { label: "Notice Period", val: selected.notice_period },
                    { label: "Experience", val: `${selected.total_experience} years` },
                    { label: "Location", val: selected.current_location },
                    { label: "Preferred Location", val: selected.preferred_location },
                    { label: "WFH Preference", val: selected.wfh_preference },
                    { label: "AI Comfort", val: `${selected.ai_comfort_score}/10` },
                  ].map((item) => (
                    <div key={item.label} className="bg-zinc-900 rounded-lg p-3">
                      <p className="text-zinc-500 text-xs">{item.label}</p>
                      <p className="text-white text-sm font-medium mt-0.5">{item.val}</p>
                    </div>
                  ))}
                </div>

                {[
                  { label: "AI tools used", val: selected.ai_tools_used },
                  { label: "What they built with AI", val: selected.ai_project_built },
                  { label: "AI vision for role", val: selected.ai_future_vision },
                  { label: "Without AI tools", val: selected.ai_without_tools_feeling },
                  { label: "Biggest build", val: selected.biggest_build },
                  { label: "Why us", val: selected.why_us },
                ].map((item) => (
                  <div key={item.label} className="space-y-1">
                    <p className="text-zinc-500 text-xs uppercase tracking-wider">{item.label}</p>
                    <p className="text-zinc-300 text-sm leading-relaxed">{item.val}</p>
                  </div>
                ))}

                <div className="flex gap-3 flex-wrap pt-2">
                  {selected.linkedin_url && (
                    <a href={selected.linkedin_url} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-blue-400 hover:underline">LinkedIn →</a>
                  )}
                  {selected.github_url && (
                    <a href={selected.github_url} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-zinc-400 hover:underline">GitHub →</a>
                  )}
                  {selected.portfolio_url && (
                    <a href={selected.portfolio_url} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-zinc-400 hover:underline">Portfolio →</a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
