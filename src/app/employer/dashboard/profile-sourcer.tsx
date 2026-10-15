"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const OR = "#7C3AED";

interface Job {
  id: string;
  title: string;
  description?: string;
}

interface Profile {
  name: string;
  current_role: string;
  company: string;
  skills: string[];
  match_score: number;
  profile_url: string;
  source: string;
  summary: string;
}

type ProfileAction = "selected" | "rejected" | "screening" | null;

async function saveCandidate(p: Profile, jobId: string | null, status: string) {
  const isLinkedIn = p.profile_url.includes("linkedin.com");
  const isNaukri = p.profile_url.includes("naukri.com");
  await fetch("/api/candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: p.name,
      current_role: p.current_role,
      current_company: p.company,
      key_skills: p.skills.join(", "),
      profile_summary: p.summary,
      linkedin_url: isLinkedIn ? p.profile_url : null,
      naukri_url: isNaukri ? p.profile_url : null,
      email: `sourced-${Date.now()}-${Math.random().toString(36).slice(2)}@sourced.reqr`,
      status,
      job_id: jobId ?? null,
      ai_score: p.match_score,
    }),
  });
}

export default function ProfileSourcer({ jobs: initialJobs }: { jobs: Job[] }) {
  const [jobList, setJobList] = useState<Job[]>(initialJobs);
  const [selectedJobId, setSelectedJobId] = useState(initialJobs[0]?.id ?? "");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actions, setActions] = useState<Record<number, ProfileAction>>({});
  const [actionLoading, setActionLoading] = useState<number | "bulk" | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  async function source() {
    const job = jobList.find(j => j.id === selectedJobId) ?? jobList[0];
    if (!job) return;
    setLoading(true);
    setError("");
    setActions({});
    setSelected(new Set());
    const res = await fetch("/api/source-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: job.title, description: job.description ?? "" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Sourcing failed");
    } else {
      setProfiles(data.profiles ?? []);
    }
    setLoading(false);
  }

  async function handleAction(i: number, action: ProfileAction) {
    if (!action) return;
    const p = profiles[i];
    const job = jobList.find(j => j.id === selectedJobId);
    setActionLoading(i);
    try {
      if (action !== "rejected") {
        await saveCandidate(p, job?.id ?? null, action === "screening" ? "new" : "shortlisted");
      }
      setActions(prev => ({ ...prev, [i]: action }));
      setSelected(prev => { const n = new Set(prev); n.delete(i); return n; });
    } catch {
      /* silently fail */
    } finally {
      setActionLoading(null);
    }
  }

  async function bulkAction(action: "selected" | "rejected" | "screening") {
    if (!selected.size) return;
    setActionLoading("bulk");
    const job = jobList.find(j => j.id === selectedJobId);
    const indices = [...selected];
    try {
      if (action !== "rejected") {
        await Promise.allSettled(
          indices.map(i => saveCandidate(profiles[i], job?.id ?? null, action === "screening" ? "new" : "shortlisted"))
        );
      }
      setActions(prev => {
        const next = { ...prev };
        indices.forEach(i => { next[i] = action; });
        return next;
      });
      setSelected(new Set());
    } finally {
      setActionLoading(null);
    }
  }

  function toggleSelect(i: number) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
  }

  function toggleSelectAll() {
    const active = profiles.map((_, i) => i).filter(i => !actions[i]);
    if (selected.size === active.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(active));
    }
  }

  const activeIndices = profiles.map((_, i) => i).filter(i => actions[i] !== "rejected");
  const undecidedIndices = activeIndices.filter(i => !actions[i]);
  const allSelected = undecidedIndices.length > 0 && undecidedIndices.every(i => selected.has(i));

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Source Profiles</h2>
          <Link
            href="/employer/jd-builder"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg hover:opacity-90 transition-all"
            style={{ background: "rgba(124,58,237,0.08)", color: OR }}
          >
            + New JD
          </Link>
        </div>
        <div className="space-y-3">
          {jobList.length === 0 ? (
            <p className="text-sm text-gray-400">No JDs saved yet.</p>
          ) : (
            <div className="border rounded-md divide-y max-h-36 overflow-y-auto">
              {jobList.map(j => (
                <div
                  key={j.id}
                  onClick={() => setSelectedJobId(j.id)}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${selectedJobId === j.id ? "bg-violet-50" : "hover:bg-gray-50"}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${selectedJobId === j.id ? "bg-violet-500" : "bg-gray-200"}`} />
                    <span className="text-sm truncate">{j.title}</span>
                  </div>
                  <button
                    onClick={async e => {
                      e.stopPropagation();
                      if (!confirm(`Delete "${j.title}"? This cannot be undone.`)) return;
                      const res = await fetch(`/api/jd?id=${j.id}`, { method: "DELETE" });
                      if (!res.ok) { alert("Delete failed — please try again."); return; }
                      const next = jobList.filter(x => x.id !== j.id);
                      setJobList(next);
                      if (selectedJobId === j.id) setSelectedJobId(next[0]?.id ?? "");
                    }}
                    className="ml-3 px-2 py-1 text-xs font-medium rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors shrink-0"
                  >Delete</button>
                </div>
              ))}
            </div>
          )}
          <Button onClick={source} disabled={loading || !selectedJobId || jobList.length === 0}>
            {loading ? "Sourcing…" : "Find profiles"}
          </Button>
        </div>
        {error && <p className="text-destructive text-sm mt-2">{error}</p>}
      </div>

      {activeIndices.length > 0 && (
        <div className="bg-white rounded-lg border divide-y">
          {/* Header */}
          <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded accent-violet-500"
                title="Select all"
              />
              <div>
                <h3 className="font-semibold">{activeIndices.length} match{activeIndices.length !== 1 ? "es" : ""} found</h3>
              </div>
            </div>

            {selected.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">{selected.size} selected</span>
                <button
                  onClick={() => bulkAction("selected")}
                  disabled={actionLoading === "bulk"}
                  className="px-3 py-1.5 text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all disabled:opacity-40"
                  style={{ background: OR }}
                >
                  {actionLoading === "bulk" ? "…" : "✓ Select all"}
                </button>
                <button
                  onClick={() => bulkAction("screening")}
                  disabled={actionLoading === "bulk"}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-all disabled:opacity-40"
                >
                  {actionLoading === "bulk" ? "…" : "→ Move to Screen CVs"}
                </button>
                <button
                  onClick={() => bulkAction("rejected")}
                  disabled={actionLoading === "bulk"}
                  className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-red-50 hover:text-red-600 transition-all disabled:opacity-40"
                >
                  ✗ Reject all
                </button>
              </div>
            )}
          </div>

          {/* Profile rows */}
          {profiles.map((p, i) => {
            if (actions[i] === "rejected") return null;
            const done = actions[i] === "selected" || actions[i] === "screening";
            const isChecked = selected.has(i);
            return (
              <div key={i} className={`p-4 transition-colors ${done ? "bg-green-50/40" : isChecked ? "bg-violet-50/30" : ""}`}>
                <div className="flex items-start gap-3">
                  {!done && (
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSelect(i)}
                      className="mt-1 w-4 h-4 rounded accent-violet-500 shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{p.name}</p>
                        <p className="text-sm text-muted-foreground">{p.current_role} · {p.company}</p>
                        <p className="text-sm mt-1 text-gray-600">{p.summary}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {p.skills.slice(0, 6).map(s => (
                            <span key={s} className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 border border-gray-200">{s}</span>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 ml-2 shrink-0">
                        <span className="text-lg font-bold">{Math.min(100, Math.max(0, p.match_score))}%</span>
                        <span className="text-xs bg-gray-50 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">{p.source}</span>
                        <a href={p.profile_url} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="text-xs">View ↗</Button>
                        </a>
                      </div>
                    </div>

                    {/* Per-profile actions */}
                    <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2 flex-wrap">
                      {done ? (
                        <span className="text-xs font-medium px-3 py-1.5 rounded-lg" style={{ background: "rgba(34,197,94,0.08)", color: "#16a34a" }}>
                          {actions[i] === "selected" ? "✓ Added to pipeline" : "✓ Added — send for CV screening"}
                        </span>
                      ) : (
                        <>
                          <button onClick={() => handleAction(i, "selected")} disabled={actionLoading === i} className="px-3 py-1.5 text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all disabled:opacity-40" style={{ background: OR }}>
                            {actionLoading === i ? "…" : "✓ Select"}
                          </button>
                          <button onClick={() => handleAction(i, "screening")} disabled={actionLoading === i} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-all disabled:opacity-40">
                            {actionLoading === i ? "…" : "→ Screen CV"}
                          </button>
                          <button onClick={() => handleAction(i, "rejected")} disabled={actionLoading === i} className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-red-50 hover:text-red-600 transition-all disabled:opacity-40">
                            ✗ Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && profiles.length === 0 && (
        <div className="bg-white rounded-lg border p-8 text-center text-muted-foreground text-sm">
          Select a job and click &quot;Find profiles&quot; to source candidates from job boards.
        </div>
      )}
    </div>
  );
}
