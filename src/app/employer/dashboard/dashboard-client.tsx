"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import CVScreener from "./cv-screener";
import ProfileSourcer from "./profile-sourcer";
import CandidateModal from "./candidate-modal";
import FeedbackTab from "./feedback-tab";
import { createClient } from "@/lib/supabase";

const SHIPROCKET_ORANGE = "#7C3AED";

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" />
  </svg>
);

const STATUS_BADGE: Record<string, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  Applied: "bg-blue-50 text-blue-700 border-blue-200",
  shortlisted: "bg-violet-50 text-violet-700 border-violet-200",
  Shortlisted: "bg-violet-50 text-violet-700 border-violet-200",
  interview: "bg-green-50 text-green-700 border-green-200",
  Interview: "bg-green-50 text-green-700 border-green-200",
  offer: "bg-purple-50 text-purple-700 border-purple-200",
  Offer: "bg-purple-50 text-purple-700 border-purple-200",
  rejected: "bg-red-50 text-red-600 border-red-200",
  Rejected: "bg-red-50 text-red-600 border-red-200",
};

interface VoiceScreen {
  status?: "pending" | "completed";
  triggered_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  recording_url?: string;
  transcript_url?: string;
  transcript_text?: string;
  call_id?: string;
  output_variables?: Record<string, string>;
  ai_summary?: {
    combined_score?: number;
    recommendation?: string;
    call_summary?: string;
    cv_vs_call?: string;
    highlights?: string[];
    red_flags?: string[];
    next_step?: string;
  };
}

interface Candidate {
  id: string;
  full_name?: string;
  name?: string;
  email: string;
  phone?: string;
  current_role?: string;
  current_company?: string;
  current_ctc?: string;
  expected_ctc?: string;
  notice_period?: string;
  current_location?: string;
  preferred_location?: string;
  wfh_preference?: string;
  total_experience?: string;
  experience_years?: number;
  key_skills?: string;
  profile_summary?: string;
  linkedin_url?: string;
  github_url?: string;
  naukri_url?: string;
  score?: number;
  ai_score?: number;
  ai_comfort_score?: string;
  ai_tools_used?: string;
  status: string;
  created_at?: string;
  voice_screen?: VoiceScreen;
}

interface Job {
  id: string;
  title: string;
  description?: string;
  is_active: boolean;
}

interface Props {
  userEmail: string;
  initialCandidates: Candidate[];
  initialJobs: Job[];
}

type Tab = "candidates" | "screen" | "source" | "interviews" | "team";
type SortKey = "name" | "score" | "status" | "role";

interface PrefilledCandidate {
  name: string;
  email: string;
  role: string;
}

export default function DashboardClient({ userEmail, initialCandidates, initialJobs }: Props) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get("tab");
    return (["candidates", "screen", "source", "interviews", "team"] as Tab[]).includes(t as Tab) ? (t as Tab) : "candidates";
  });
  const [prefilledCandidate, setPrefilledCandidate] = useState<PrefilledCandidate | null>(null);
  const [calendarBanner, setCalendarBanner] = useState<"connected" | "error" | null>(() => {
    if (searchParams.get("calendar") === "connected") return "connected";
    if (searchParams.get("error")?.startsWith("calendar")) return "error";
    return null;
  });
  const [candidates, setCandidates] = useState<Candidate[]>(initialCandidates);
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [dataLoading] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [callingId, setCallingId] = useState<string | null>(null);
  const [callResult, setCallResult] = useState<{ id: string; success: boolean; msg: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(false);
  const isMaster = userEmail === "jisha.bawa@shiprocket.com";
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollArrow, setShowScrollArrow] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function check() {
      if (!el) return;
      setShowScrollArrow(el.scrollTop + el.clientHeight < el.scrollHeight - 40);
    }
    check();
    el.addEventListener("scroll", check);
    window.addEventListener("resize", check);
    return () => { el.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
  }, [tab]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/employer/login";
  }

  async function refreshCandidates() {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/candidates", {
        headers: { "Authorization": `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.candidates) {
        setCandidates(data.candidates.sort((a: Candidate, b: Candidate) => {
          const sa = (a.score ?? a.ai_score ?? -1);
          const sb = (b.score ?? b.ai_score ?? -1);
          return sb - sa;
        }));
      }
    } catch { /* silent */ }
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  async function handleCall(c: Candidate) {
    if (!c.phone) {
      setCallResult({ id: c.id, success: false, msg: "No phone number on file for this candidate." });
      setTimeout(() => setCallResult(null), 4000);
      return;
    }
    setCallingId(c.id);
    try {
      const res = await fetch("/api/twenty2-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: c.phone, candidate_name: c.full_name ?? c.name ?? c.email }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setCallResult({ id: c.id, success: false, msg: data.error ?? "Call failed" });
      } else {
        const callId = data.call?.data?.call_id ?? data.call?.call_id ?? data.call?.id ?? "";
        const msg = callId
          ? `AI call queued (ID: ${callId.slice(-8)}). Candidate will be called within a few minutes.`
          : `AI call queued. Candidate will receive a call shortly.`;
        setCallResult({ id: c.id, success: true, msg });
      }
    } catch {
      setCallResult({ id: c.id, success: false, msg: "Network error — try again." });
    } finally {
      setCallingId(null);
      setTimeout(() => setCallResult(null), 5000);
    }
  }

  function handleStatusChange(id: string, status: string) {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    if (selectedCandidate?.id === id) setSelectedCandidate(prev => prev ? { ...prev, status } : prev);
    fetch("/api/candidates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    }).catch(() => null);
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === sorted.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map(c => c.id)));
    }
  }

  async function handleBulkStatus(status: string) {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const ids = Array.from(selectedIds);
    setCandidates(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, status } : c));
    await Promise.all(
      ids.map(id =>
        fetch("/api/candidates", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, status }),
        }).catch(() => null)
      )
    );
    setSelectedIds(new Set());
    setBulkLoading(false);
  }

  async function handleBulkCall() {
    if (selectedIds.size === 0) return;
    const targets = sorted.filter(c => selectedIds.has(c.id) && c.phone);
    if (targets.length === 0) {
      alert("None of the selected candidates have a phone number on file.");
      return;
    }
    setBulkLoading(true);
    // Mark all as pending immediately in UI
    setCandidates(prev => prev.map(c =>
      selectedIds.has(c.id) && c.phone
        ? { ...c, voice_screen: { ...c.voice_screen, status: "pending", triggered_at: new Date().toISOString() } }
        : c
    ));
    // Fire calls sequentially with 1s gap to avoid rate limiting
    for (const c of targets) {
      await fetch("/api/twenty2-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: c.phone, candidate_name: c.full_name ?? c.name ?? c.email }),
      }).catch(() => null);
      await new Promise(r => setTimeout(r, 1000));
    }
    setSelectedIds(new Set());
    setBulkLoading(false);
    setCallResult({ id: "bulk", success: true, msg: `AI screening calls queued for ${targets.length} candidate${targets.length > 1 ? "s" : ""}. They will be called shortly.` });
    setTimeout(() => setCallResult(null), 6000);
  }

  const sorted = [...candidates].sort((a, b) => {
    let av: string | number = 0, bv: string | number = 0;
    if (sortKey === "score") { av = a.score ?? a.ai_score ?? -1; bv = b.score ?? b.ai_score ?? -1; }
    else if (sortKey === "name") { av = a.full_name ?? a.name ?? ""; bv = b.full_name ?? b.name ?? ""; }
    else if (sortKey === "status") { av = a.status; bv = b.status; }
    else if (sortKey === "role") { av = a.current_role ?? ""; bv = b.current_role ?? ""; }
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ? 1 : -1;
    return 0;
  });

  const SortIndicator = ({ k }: { k: SortKey }) => (
    <span className="ml-1 text-xs opacity-50">
      {sortKey === k ? (sortAsc ? "↑" : "↓") : "↕"}
    </span>
  );

  return (
    <main className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 px-6 py-3.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: SHIPROCKET_ORANGE }}>
              <ShieldIcon className="w-4 h-4 fill-white" />
            </div>
            <span className="font-bold text-gray-900 tracking-tight">Reqr</span>
            <span className="text-violet-400 text-xs">by Shiprocket</span>
          </Link>
          <div className="flex gap-1">
            {(["candidates", "screen", "source", "interviews", ...(isMaster ? ["team"] : [])] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setPrefilledCandidate(null); if (t === "candidates") refreshCandidates(); }}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === t ? "bg-violet-600 text-white" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                {t === "candidates" ? "Candidates"
                  : t === "screen" ? "Screen CVs"
                  : t === "source" ? "Source Profiles"
                  : t === "interviews" ? "Interviews"
                  : "Team"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{userEmail}</span>
          <Button size="sm" variant="ghost" onClick={handleSignOut} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 text-xs">
            Sign out
          </Button>
        </div>
      </nav>

      {calendarBanner === "connected" && (
        <div className="bg-green-600 text-white text-sm px-6 py-2.5 flex items-center justify-between">
          <span>✓ Google Calendar connected — Meet links will now be auto-generated when you schedule interviews.</span>
          <button onClick={() => setCalendarBanner(null)} className="text-white/70 hover:text-white ml-4">×</button>
        </div>
      )}
      {calendarBanner === "error" && (
        <div className="bg-red-600 text-white text-sm px-6 py-2.5 flex items-center justify-between">
          <span>Google Calendar connection failed ({searchParams.get("reason") ?? "unknown error"}). Check your Google Cloud credentials and try again.</span>
          <button onClick={() => setCalendarBanner(null)} className="text-white/70 hover:text-white ml-4">×</button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto relative" style={{ maxHeight: "calc(100vh - 56px)" }}>
      {showScrollArrow && (
        <button
          onClick={() => scrollRef.current?.scrollBy({ top: 300, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-40 w-10 h-10 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:shadow-xl transition-all animate-bounce"
          aria-label="Scroll down"
        >
          ↓
        </button>
      )}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {tab === "candidates" && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              {[
                { label: "Total candidates", value: candidates.length, color: "text-gray-900" },
                { label: "Shortlisted", value: candidates.filter(c => c.status === "shortlisted" || c.status === "Shortlisted").length, color: "text-violet-600" },
                { label: "Interviews", value: candidates.filter(c => c.status === "interview" || c.status === "Interview").length, color: "text-green-600" },
                { label: "Active jobs", value: jobs.filter(j => j.is_active).length, color: "text-blue-600" },
              ].map((stat) => (
                <div key={stat.label} className="bg-white rounded-xl border p-5 shadow-sm">
                  <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Candidates table */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">All Candidates <span className="text-sm text-gray-400 font-normal ml-1">{dataLoading ? "…" : `(${candidates.length})`}</span></h2>
                <span className="text-xs text-muted-foreground">Click a row to view full profile</span>
              </div>

              {/* Bulk call toast */}
              {callResult?.id === "bulk" && (
                <div className={`mx-5 mt-3 px-4 py-2.5 rounded-xl text-sm font-medium ${callResult.success ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                  {callResult.msg}
                </div>
              )}

              {/* Bulk action bar */}
              {selectedIds.size > 0 && (
                <div className="px-5 py-3 bg-violet-50 border-b border-violet-200 flex items-center gap-3">
                  <span className="text-sm font-medium text-violet-800">{selectedIds.size} selected</span>
                  <button
                    onClick={() => handleBulkStatus("shortlisted")}
                    disabled={bulkLoading}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 hover:opacity-90 transition-all"
                    style={{ background: SHIPROCKET_ORANGE }}
                  >
                    {bulkLoading ? "Updating…" : `✓ Shortlist all (${selectedIds.size})`}
                  </button>
                  <button
                    onClick={() => handleBulkStatus("rejected")}
                    disabled={bulkLoading}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 disabled:opacity-50 hover:bg-red-600 transition-all"
                  >
                    {bulkLoading ? "Updating…" : `✗ Reject all (${selectedIds.size})`}
                  </button>
                  <button
                    onClick={handleBulkCall}
                    disabled={bulkLoading}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 disabled:opacity-50 hover:bg-blue-100 transition-all"
                  >
                    {bulkLoading ? "Calling…" : `📞 AI Screen all (${sorted.filter(c => selectedIds.has(c.id) && c.phone).length} with phone)`}
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="ml-auto text-xs text-violet-600 hover:text-violet-900"
                  >
                    Clear selection
                  </button>
                </div>
              )}

              {/* Sortable header */}
              <div className="px-5 py-2 border-b bg-gray-50 grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide items-center">
                <div className="col-span-1 flex items-center" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={sorted.length > 0 && selectedIds.size === sorted.length}
                    ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < sorted.length; }}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded accent-violet-600 cursor-pointer"
                  />
                </div>
                <button onClick={() => handleSort("name")} className="col-span-3 text-left hover:text-gray-700">
                  Name <SortIndicator k="name" />
                </button>
                <button onClick={() => handleSort("role")} className="col-span-2 text-left hover:text-gray-700">
                  Role <SortIndicator k="role" />
                </button>
                <button onClick={() => handleSort("score")} className="col-span-2 text-center hover:text-gray-700">
                  Score <SortIndicator k="score" />
                </button>
                <button onClick={() => handleSort("status")} className="col-span-2 text-left hover:text-gray-700">
                  Status <SortIndicator k="status" />
                </button>
                <div className="col-span-2 text-right text-xs">Actions</div>
              </div>
              <div className="divide-y">
                {dataLoading ? (
                  <div className="divide-y">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="px-5 py-3 grid grid-cols-12 gap-2 items-center animate-pulse">
                        <div className="col-span-1"><div className="w-4 h-4 bg-gray-100 rounded" /></div>
                        <div className="col-span-3 space-y-1.5">
                          <div className="h-3 bg-gray-100 rounded w-3/4" />
                          <div className="h-2.5 bg-gray-100 rounded w-1/2" />
                        </div>
                        <div className="col-span-2 space-y-1.5">
                          <div className="h-3 bg-gray-100 rounded w-2/3" />
                        </div>
                        <div className="col-span-2 flex justify-center">
                          <div className="w-8 h-8 rounded-full bg-gray-100" />
                        </div>
                        <div className="col-span-2">
                          <div className="h-5 bg-gray-100 rounded-full w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : sorted.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-sm text-muted-foreground">No candidates yet.</p>
                  </div>
                ) : (
                  sorted.map((c) => {
                    const displayName = c.full_name ?? c.name ?? c.email;
                    const scoreVal = c.score != null ? Math.min(Math.round(c.score), 100) : c.ai_score != null ? Math.min(Math.round(c.ai_score), 100) : undefined;
                    const isChecked = selectedIds.has(c.id);
                    return (
                      <div
                        key={c.id}
                        className={`px-5 py-3 grid grid-cols-12 gap-2 items-center hover:bg-violet-50/30 transition-colors cursor-pointer ${isChecked ? "bg-violet-50/50" : ""}`}
                        onClick={() => setSelectedCandidate(c)}
                      >
                        <div className="col-span-1 flex items-center" onClick={e => { e.stopPropagation(); toggleSelect(c.id); }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelect(c.id)}
                            className="w-4 h-4 rounded accent-violet-600 cursor-pointer"
                          />
                        </div>
                        <div className="col-span-3">
                          <p
                            className="font-medium text-violet-700 text-sm truncate hover:underline cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPrefilledCandidate({ name: displayName, email: c.email, role: c.current_role ?? "" });
                              setTab("interviews");
                            }}
                          >{displayName}</p>
                          <p className="text-xs text-gray-400 truncate">{c.email}</p>
                          {(c.linkedin_url || c.github_url) && (
                            <div className="flex gap-2 mt-0.5" onClick={e => e.stopPropagation()}>
                              {c.linkedin_url && (
                                <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline">LinkedIn</a>
                              )}
                              {c.github_url && (
                                <a href={c.github_url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-gray-600 hover:text-gray-900 hover:underline">GitHub</a>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs text-gray-700 truncate">{c.current_role}</p>
                          {c.current_company && <p className="text-xs text-gray-400 truncate">{c.current_company}</p>}
                        </div>
                        <div className="col-span-2 flex justify-center">
                          {scoreVal != null ? (
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: SHIPROCKET_ORANGE }}>
                              {scoreVal}
                            </div>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </div>
                        <div className="col-span-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_BADGE[c.status] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                            {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                          </span>
                        </div>
                        <div className="col-span-2 flex justify-end items-center gap-1" onClick={e => e.stopPropagation()}>
                          {c.phone ? (
                            <button
                              title={`AI Screen: ${c.phone}`}
                              onClick={() => handleCall(c)}
                              disabled={callingId === c.id}
                              className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs hover:bg-blue-100 transition-colors disabled:opacity-40"
                            >{callingId === c.id ? "…" : "📞"}</button>
                          ) : (
                            <span title="No phone number" className="w-6 h-6 rounded-full bg-gray-50 text-gray-300 flex items-center justify-center text-xs cursor-not-allowed">📞</span>
                          )}
                          <button
                            title="Shortlist"
                            onClick={() => handleStatusChange(c.id, "shortlisted")}
                            className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs hover:bg-violet-200 transition-colors"
                          >✓</button>
                          <button
                            title="Reject"
                            onClick={() => handleStatusChange(c.id, "rejected")}
                            className="w-6 h-6 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-xs hover:bg-red-100 transition-colors"
                          >✗</button>
                        </div>
                        {callResult?.id === c.id && (
                          <div className={`col-span-12 px-2 py-1.5 rounded-lg text-xs mt-1 ${callResult.success ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                            {callResult.msg}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Active jobs */}
            {jobs.length > 0 && (
              <div className="mt-6 bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Active Job Descriptions</h2>
                  <Link href="/employer/jd-builder">
                    <Button size="sm" className="text-white text-xs" style={{ background: SHIPROCKET_ORANGE }}>+ New JD</Button>
                  </Link>
                </div>
                <div className="divide-y">
                  {jobs.map((job) => (
                    <div key={job.id} className={`px-5 py-3 flex items-center justify-between hover:bg-gray-50 ${!job.is_active ? "opacity-50" : ""}`}>
                      <p className="text-sm font-medium">{job.title}</p>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${job.is_active ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                          {job.is_active ? "Active" : "Inactive"}
                        </span>
                        <button
                          title="Delete this JD"
                          onClick={async () => {
                            if (!confirm(`Delete "${job.title}"? This cannot be undone.`)) return;
                            await fetch(`/api/jd?id=${job.id}`, { method: "DELETE" });
                            setJobs(prev => prev.filter(j => j.id !== job.id));
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-md border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors text-base leading-none"
                        >×</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </>
        )}

        {tab !== "candidates" && (
          <button
            onClick={() => setTab("candidates")}
            className="mb-4 text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors"
          >
            ← Back to Candidates
          </button>
        )}
        {tab === "screen" && <CVScreener jobs={jobs} onCandidateScreened={refreshCandidates} />}
        {tab === "source" && <ProfileSourcer jobs={jobs} />}
        {tab === "interviews" && <FeedbackTab prefilledCandidate={prefilledCandidate} onPrefilledConsumed={() => setPrefilledCandidate(null)} />}
        {tab === "team" && isMaster && (
          <div className="max-w-lg">
            <h2 className="font-semibold text-gray-900 mb-6">Team access</h2>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-gray-400"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                <p className="text-sm font-semibold text-gray-900">Invite recruiters</p>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-xs text-gray-500">Invited recruiters receive a sign-in link by email. For existing users, copy and share the one-time link manually.</p>
                <InviteForm />
                <RecruiterList />
              </div>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Candidate modal */}
      {selectedCandidate && (
        <CandidateModal
          candidate={selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
          onStatusChange={handleStatusChange}
          onScheduleInterview={(c) => {
            handleStatusChange(c.id, "interview");
            setSelectedCandidate(null);
            setPrefilledCandidate({
              name: c.full_name ?? c.name ?? c.email,
              email: c.email,
              role: c.current_role ?? "",
            });
            setTab("interviews");
          }}
        />
      )}
    </main>
  );
}



function InviteForm() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ type: "success" | "existing" | "error"; msg: string; link?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!email) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/send-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ type: "error", msg: data.error ?? "Failed to send invite" });
      } else if (data.existing_user) {
        setResult({
          type: "existing",
          msg: "User already has access.",
          link: data.action_link ?? undefined,
        });
      } else {
        setResult({ type: "success", msg: `Invite sent to ${email}.` });
        setEmail("");
      }
    } catch {
      setResult({ type: "error", msg: "Failed to send invite. Try again." });
    }
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Add a recruiter — they&apos;ll receive an email invite to access the dashboard.</p>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") send(); }}
          placeholder="recruiter@shiprocket.com"
          className="border rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
        />
        <Button size="sm" onClick={send} disabled={loading || !email} style={{ background: SHIPROCKET_ORANGE }} className="text-white">
          {loading ? "Sending…" : "Invite"}
        </Button>
      </div>
      {result?.type === "success" && (
        <p className="text-xs text-green-600">✓ {result.msg} They can log in at /employer/login.</p>
      )}
      {result?.type === "existing" && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 space-y-1">
          <p>{result.msg} Share the login page: <strong>/employer/login</strong></p>
          {result.link && (
            <button
              onClick={() => { navigator.clipboard.writeText(result.link!); }}
              className="underline hover:text-blue-900"
            >
              Copy one-time login link →
            </button>
          )}
        </div>
      )}
      {result?.type === "error" && (
        <p className="text-xs text-red-500">{result.msg}</p>
      )}
    </div>
  );
}

interface Recruiter {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at?: string;
  confirmed: boolean;
}

function RecruiterList() {
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/recruiters")
      .then(r => r.json())
      .then(d => { if (d.recruiters) setRecruiters(d.recruiters); })
      .catch(() => null)
      .finally(() => setLoaded(true));
  }, []);

  async function revoke(id: string, email: string) {
    if (!confirm(`Remove access for ${email}? They will be signed out immediately.`)) return;
    setRevoking(id);
    try {
      const res = await fetch("/api/admin/recruiters", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id }),
      });
      if (res.ok) {
        setRecruiters(prev => prev.filter(r => r.id !== id));
      }
    } finally {
      setRevoking(null);
    }
  }

  if (!loaded) return <p className="text-xs text-gray-400">Loading recruiters…</p>;
  if (recruiters.length === 0) return (
    <p className="text-xs text-gray-400">No recruiters added yet. Invite someone above.</p>
  );

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active recruiters</p>
      <div className="divide-y border rounded-lg overflow-hidden">
        {recruiters.map(r => (
          <div key={r.id} className="flex items-center justify-between px-3 py-2.5 bg-white hover:bg-gray-50">
            <div>
              <p className="text-sm text-gray-900">{r.email}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {r.confirmed ? "✓ Active" : "⏳ Invite pending"}
                {r.last_sign_in_at && ` · Last login ${new Date(r.last_sign_in_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
              </p>
            </div>
            <button
              onClick={() => revoke(r.id, r.email)}
              disabled={revoking === r.id}
              className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-40"
            >
              {revoking === r.id ? "Removing…" : "Revoke"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
