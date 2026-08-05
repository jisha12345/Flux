"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import CVScreener from "./cv-screener";
import ProfileSourcer from "./profile-sourcer";
import CandidateModal from "./candidate-modal";
import TestsTab from "./tests-tab";
import AiInterviewsTab from "./ai-interviews-tab";
import InterviewScheduler from "./interview-scheduler";
import TranscriptAnalyzer from "./transcript-analyzer";
import { createClient } from "@/lib/supabase";

const SHIPROCKET_ORANGE = "#F26522";

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" />
  </svg>
);

const STATUS_BADGE: Record<string, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  Applied: "bg-blue-50 text-blue-700 border-blue-200",
  shortlisted: "bg-orange-50 text-orange-700 border-orange-200",
  Shortlisted: "bg-orange-50 text-orange-700 border-orange-200",
  interview: "bg-green-50 text-green-700 border-green-200",
  Interview: "bg-green-50 text-green-700 border-green-200",
  offer: "bg-purple-50 text-purple-700 border-purple-200",
  Offer: "bg-purple-50 text-purple-700 border-purple-200",
  rejected: "bg-red-50 text-red-600 border-red-200",
  Rejected: "bg-red-50 text-red-600 border-red-200",
};

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
}

interface Job {
  id: string;
  title: string;
  description?: string;
  is_active: boolean;
}

interface Props {
  candidates: Candidate[];
  jobs: Job[];
  userEmail: string;
}

type Tab = "candidates" | "screen" | "source" | "interviews" | "ai";
type SortKey = "name" | "score" | "status" | "role";

export default function DashboardClient({ candidates: initialCandidates, jobs, userEmail }: Props) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get("tab");
    return (["candidates", "screen", "source", "interviews", "ai"] as Tab[]).includes(t as Tab) ? (t as Tab) : "candidates";

  });
  const [calendarBanner, setCalendarBanner] = useState<"connected" | "error" | null>(() => {
    if (searchParams.get("calendar") === "connected") return "connected";
    if (searchParams.get("error")?.startsWith("calendar")) return "error";
    return null;
  });
  const [candidates, setCandidates] = useState<Candidate[]>(initialCandidates);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(false);
  const isMaster = userEmail === "jisha.bawa@shiprocket.com";

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/employer/login";
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  function handleStatusChange(id: string, status: string) {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    if (selectedCandidate?.id === id) setSelectedCandidate(prev => prev ? { ...prev, status } : prev);
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
    <main className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-[#0B1120] px-6 py-3.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: SHIPROCKET_ORANGE }}>
              <ShieldIcon className="w-4 h-4 fill-white" />
            </div>
            <span className="font-bold text-white tracking-tight">Reqr</span>
            <span className="text-orange-400 text-xs">by Shiprocket</span>
          </Link>
          <div className="flex gap-1">
            {(["candidates", "screen", "source", "interviews", "ai"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === t ? "bg-orange-500 text-white" : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                {t === "candidates" ? "Candidates"
                  : t === "screen" ? "Screen CVs"
                  : t === "source" ? "Source Profiles"
                  : t === "interviews" ? "Interviews"
                  : "AI Interviews"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/40">{userEmail}</span>
          <Link href="/employer/jd-builder">
            <Button size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10 hover:text-white bg-transparent text-xs">
              + New JD
            </Button>
          </Link>
          <Button size="sm" variant="ghost" onClick={handleSignOut} className="text-white/60 hover:text-white hover:bg-white/10 text-xs">
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

      <div className="max-w-6xl mx-auto px-6 py-8">
        {tab === "candidates" && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              {[
                { label: "Total candidates", value: candidates.length, color: "text-gray-900" },
                { label: "Shortlisted", value: candidates.filter(c => c.status === "shortlisted" || c.status === "Shortlisted").length, color: "text-orange-600" },
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
                <h2 className="font-semibold text-gray-900">All Candidates <span className="text-sm text-gray-400 font-normal ml-1">({candidates.length})</span></h2>
                <span className="text-xs text-muted-foreground">Click a row to view full profile</span>
              </div>
              {/* Sortable header */}
              <div className="px-5 py-2 border-b bg-gray-50 grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <button onClick={() => handleSort("name")} className="col-span-4 text-left hover:text-gray-700">
                  Name <SortIndicator k="name" />
                </button>
                <button onClick={() => handleSort("role")} className="col-span-3 text-left hover:text-gray-700">
                  Role <SortIndicator k="role" />
                </button>
                <button onClick={() => handleSort("score")} className="col-span-2 text-center hover:text-gray-700">
                  Score <SortIndicator k="score" />
                </button>
                <button onClick={() => handleSort("status")} className="col-span-2 text-left hover:text-gray-700">
                  Status <SortIndicator k="status" />
                </button>
                <div className="col-span-1 text-center">Act</div>
              </div>
              <div className="divide-y">
                {sorted.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-sm text-muted-foreground">No candidates yet.</p>
                  </div>
                ) : (
                  sorted.map((c) => {
                    const displayName = c.full_name ?? c.name ?? c.email;
                    const scoreVal = c.score ?? c.ai_score;
                    return (
                      <div
                        key={c.id}
                        className="px-5 py-3 grid grid-cols-12 gap-2 items-center hover:bg-orange-50/30 transition-colors cursor-pointer"
                        onClick={() => setSelectedCandidate(c)}
                      >
                        <div className="col-span-4">
                          <p className="font-medium text-gray-900 text-sm truncate">{displayName}</p>
                          <p className="text-xs text-gray-400 truncate">{c.email}</p>
                        </div>
                        <div className="col-span-3">
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
                        <div className="col-span-1 flex justify-center gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            title="Shortlist"
                            onClick={() => handleStatusChange(c.id, "shortlisted")}
                            className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs hover:bg-orange-200 transition-colors"
                          >✓</button>
                          <button
                            title="Reject"
                            onClick={() => handleStatusChange(c.id, "rejected")}
                            className="w-6 h-6 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-xs hover:bg-red-100 transition-colors"
                          >✗</button>
                        </div>
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
                  {jobs.filter(j => j.is_active).map((job) => (
                    <div key={job.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                      <p className="text-sm font-medium">{job.title}</p>
                      <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">Active</span>
                    </div>
                  ))}
                  {jobs.filter(j => !j.is_active).map((job) => (
                    <div key={job.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 opacity-50">
                      <p className="text-sm font-medium">{job.title}</p>
                      <span className="text-xs bg-gray-50 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">Inactive</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isMaster && (
              <div className="mt-6 bg-white rounded-xl border shadow-sm p-5">
                <p className="text-sm font-semibold mb-3 text-gray-900">Invite a recruiter</p>
                <InviteForm />
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
        {tab === "screen" && (
          <div className="space-y-8">
            <CVScreener jobs={jobs} />
            <TestsTab jobs={jobs} />
          </div>
        )}
        {tab === "source" && <ProfileSourcer jobs={jobs} />}
        {tab === "interviews" && <InterviewsTab candidates={candidates} onViewProfile={setSelectedCandidate} />}
        {tab === "ai" && <AiInterviewsTab candidates={candidates} jobs={jobs} />}
      </div>

      {/* Candidate modal */}
      {selectedCandidate && (
        <CandidateModal
          candidate={selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </main>
  );
}

interface Interview {
  id: string;
  candidate_id: string;
  candidate_name?: string;
  interviewer_name?: string;
  scheduled_at?: string;
  duration_minutes?: number;
  meet_link?: string;
  round?: number;
  status?: string;
  transcript?: string;
  ai_analysis?: Record<string, unknown>;
}

function InterviewsTab({ candidates, onViewProfile }: { candidates: Candidate[]; onViewProfile: (c: Candidate) => void }) {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [scheduling, setScheduling] = useState<{ id: string; name: string; round: number } | null>(null);
  const [analyzing, setAnalyzing] = useState<Interview | null>(null);

  useEffect(() => {
    fetch("/api/calendar/events")
      .then(r => r.json())
      .then(d => { if (d.interviews) setInterviews(d.interviews); })
      .catch(() => null)
      .finally(() => setLoaded(true));
  }, []);

  function onScheduled(meetLink: string, candidateId: string) {
    setInterviews(prev => [
      { id: Date.now().toString(), candidate_id: candidateId, meet_link: meetLink, status: "scheduled" },
      ...prev,
    ]);
    // Do NOT close here — let the scheduler show the result screen with the Meet link
    // The user closes it explicitly via the Close button
  }

  const shortlisted = candidates.filter(c => c.status === "shortlisted" || c.status === "Shortlisted" || c.status === "interview" || c.status === "Interview");

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border shadow-sm p-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900 mb-1">Interview Schedule</h3>
          <p className="text-sm text-gray-400">Schedule Google Meet interviews and analyse transcripts with AI after each session.</p>
        </div>
        <a href="/api/calendar/auth" className="shrink-0 px-4 py-2 text-xs font-semibold rounded-xl border border-gray-200 text-gray-600 hover:border-gray-300 whitespace-nowrap">
          Connect Google Calendar →
        </a>
      </div>

      {/* Quick schedule from shortlisted */}
      {shortlisted.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Schedule next round</p>
          <div className="space-y-2">
            {shortlisted.map(c => {
              const name = c.full_name ?? c.name ?? c.email;
              const isInterview = c.status === "interview" || c.status === "Interview";
              return (
                <div key={c.id} className="flex items-center justify-between gap-4 py-2 border-b border-gray-50 last:border-0">
                  <button className="text-left min-w-0" onClick={() => onViewProfile(c)}>
                    <p className="text-sm font-medium text-gray-900 hover:text-orange-600 transition-colors truncate">{name}</p>
                    <p className="text-xs text-gray-400">{c.current_role ?? "—"}</p>
                  </button>
                  <button
                    onClick={() => setScheduling({ id: c.id, name, round: isInterview ? 2 : 1 })}
                    className="px-3 py-1.5 text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all shrink-0"
                    style={{ background: SHIPROCKET_ORANGE }}
                  >
                    Schedule {isInterview ? "Round 2" : "Screening call"} →
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Interview list */}
      {loaded && interviews.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm p-10 text-center">
          <p className="text-gray-400 text-sm">No interviews scheduled yet. Shortlist candidates to get started.</p>
        </div>
      ) : (
        interviews.map(iv => {
          const scheduledDate = iv.scheduled_at ? new Date(iv.scheduled_at) : null;
          return (
            <div key={iv.id} className="bg-white rounded-xl border shadow-sm p-5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{iv.candidate_name ?? "Candidate"}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {iv.interviewer_name ?? "Interviewer"} · Round {iv.round ?? 1}
                  {scheduledDate && ` · ${scheduledDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ${scheduledDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} IST`}
                  {iv.duration_minutes && ` · ${iv.duration_minutes}m`}
                </p>
                {iv.ai_analysis && <p className="text-xs text-green-600 mt-1">✓ AI analysis complete</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {iv.meet_link && (
                  <a href={iv.meet_link} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:border-gray-300 transition-colors">
                    Join Meet →
                  </a>
                )}
                <button
                  onClick={() => setAnalyzing(iv)}
                  className="px-3 py-1.5 text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all"
                  style={{ background: SHIPROCKET_ORANGE }}
                >
                  {iv.ai_analysis ? "View AI analysis" : "Add transcript + analyse"}
                </button>
              </div>
            </div>
          );
        })
      )}

      {scheduling && (
        <InterviewScheduler
          candidateId={scheduling.id}
          candidateName={scheduling.name}
          round={scheduling.round}
          onClose={() => setScheduling(null)}
          onScheduled={(meetLink) => onScheduled(meetLink, scheduling.id)}
        />
      )}

      {analyzing && (
        <TranscriptAnalyzer
          interviewId={analyzing.id}
          candidateName={analyzing.candidate_name}
          role={undefined}
          onClose={() => setAnalyzing(null)}
        />
      )}
    </div>
  );
}


function InviteForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!email) return;
    setLoading(true);
    await fetch("/api/send-magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSent(true);
    setLoading(false);
  }

  if (sent) return <p className="text-sm text-green-600">Magic link sent to {email}. Valid for one use.</p>;

  return (
    <div className="flex gap-2">
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="recruiter@shiprocket.com"
        className="border rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
      />
      <Button size="sm" onClick={send} disabled={loading || !email} style={{ background: SHIPROCKET_ORANGE }} className="text-white">
        {loading ? "Sending…" : "Send magic link"}
      </Button>
    </div>
  );
}
