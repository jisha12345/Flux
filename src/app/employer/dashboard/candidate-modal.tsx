"use client";

import { useState, useEffect } from "react";

const VIOLET = "#7C3AED";

const RECO_BADGE: Record<string, string> = {
  "Strong Hire": "bg-emerald-50 text-emerald-700 border-emerald-200",
  Hire: "bg-green-50 text-green-700 border-green-200",
  Hold: "bg-amber-50 text-amber-700 border-amber-200",
  Reject: "bg-red-50 text-red-600 border-red-200",
};

const STATUS_BADGE: Record<string, string> = {
  new: "bg-blue-50 text-blue-700",
  Applied: "bg-blue-50 text-blue-700",
  shortlisted: "bg-violet-50 text-violet-700",
  Shortlisted: "bg-violet-50 text-violet-700",
  interview: "bg-green-50 text-green-700",
  Interview: "bg-green-50 text-green-700",
  offer: "bg-purple-50 text-purple-700",
  rejected: "bg-red-50 text-red-600",
  Rejected: "bg-red-50 text-red-600",
};

interface VoiceScreenSummary {
  combined_score?: number;
  recommendation?: string;
  call_summary?: string;
  cv_vs_call?: string;
  highlights?: string[];
  red_flags?: string[];
  next_step?: string;
}

interface VoiceScreen {
  status?: "pending" | "completed";
  triggered_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  recording_url?: string;
  transcript_url?: string;
  transcript_text?: string;
  output_variables?: Record<string, string>;
  ai_summary?: VoiceScreenSummary;
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
  cv_url?: string;
  score?: number;
  ai_score?: number;
  ai_comfort_score?: string;
  ai_tools_used?: string;
  status: string;
  created_at?: string;
  voice_screen?: VoiceScreen;
}

interface Analysis {
  opportunities: string[];
  watchout: string[];
  suggestion: string;
}

interface FeedbackResult {
  ai_summary?: string;
  competency_scores?: Record<string, number>;
  strengths?: string[];
  concerns?: string[];
  recommendation?: string;
  overall_score?: number;
  raw_notes?: string;
  processing_status?: string;
}

interface FeedbackRow {
  interview_id: string;
  round: string;
  interviewer_name: string;
  status: string;
  created_at: string;
  role: string;
  result: FeedbackResult | null;
}

interface Props {
  candidate: Candidate | null;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  onScheduleInterview?: (candidate: Candidate) => void;
}

function InfoChip({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full px-3 py-1">
      <span className="text-sm">{icon}</span>
      <span className="text-xs text-gray-700 whitespace-nowrap">{label}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{title}</p>
      {children}
    </div>
  );
}

export default function CandidateModal({ candidate, onClose, onStatusChange, onScheduleInterview }: Props) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedbackRows, setFeedbackRows] = useState<FeedbackRow[]>([]);
  const [expandedRound, setExpandedRound] = useState<string | null>(null);
  const [showContact, setShowContact] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "feedback" | "screening">("profile");

  useEffect(() => {
    if (!candidate) return;
    setActiveTab("profile");
    setShowContact(false);
    setExpandedRound(null);
    const name = candidate.full_name ?? candidate.name ?? "";
    if (!name) return;
    fetch(`/api/candidates/feedback?name=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setFeedbackRows(d); })
      .catch(() => null);
  }, [candidate?.id]);

  if (!candidate) return null;

  const c = candidate;
  const displayName = c.full_name ?? c.name ?? c.email;
  const initials = displayName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
  const scoreVal = c.score != null ? Math.min(Math.round(c.score), 100) : c.ai_score != null ? Math.min(Math.round(c.ai_score), 100) : null;
  const skills = c.key_skills?.split(",").map((s: string) => s.trim()).filter(Boolean) ?? [];
  const submittedFeedback = feedbackRows.filter((f) => f.result?.processing_status === "done");

  async function generateAnalysis() {
    setAnalysisLoading(true);
    try {
      const res = await fetch("/api/employer/candidate-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: c.id }),
      });
      setAnalysis(await res.json());
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function updateStatus(status: string) {
    setActionLoading(status);
    try {
      await fetch("/api/candidates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, status }),
      });
      onStatusChange(c.id, status);
    } finally {
      setActionLoading(null);
    }
  }

  const appliedDate = c.created_at
    ? new Date(c.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />

      <div className="w-full max-w-xl bg-white h-full flex flex-col shadow-2xl">

        {/* ── Header ── */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 bg-white sticky top-0 z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
                style={{ background: VIOLET }}
              >
                {initials}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-gray-900">{displayName}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[c.status] ?? "bg-gray-50 text-gray-600"}`}>
                    {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {[c.current_role, c.current_company].filter(Boolean).join(" @ ")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {scoreVal != null && (
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: VIOLET }}>
                  {scoreVal}
                </div>
              )}
              {c.phone && (
                <a href={`tel:${c.phone}`} className="w-8 h-8 rounded-full bg-green-50 border border-green-200 flex items-center justify-center text-green-600 hover:bg-green-100 transition-colors" title={c.phone}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                </a>
              )}
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full text-xl transition-colors">×</button>
            </div>
          </div>

          {/* Info chips */}
          <div className="flex flex-wrap gap-2 mt-3">
            {(c.total_experience || c.experience_years) && (
              <InfoChip icon="💼" label={c.total_experience ?? `${c.experience_years}y exp`} />
            )}
            {c.current_location && <InfoChip icon="📍" label={c.current_location} />}
            {c.preferred_location && <InfoChip icon="🎯" label={c.preferred_location} />}
            {c.notice_period && <InfoChip icon="⏱" label={c.notice_period} />}
            {appliedDate && <InfoChip icon="📅" label={`Applied ${appliedDate}`} />}
            {c.wfh_preference && <InfoChip icon="🏠" label={c.wfh_preference} />}
          </div>

          {/* Sub-tabs */}
          <div className="flex gap-1 mt-3">
            {[
              { id: "profile", label: "Profile" },
              { id: "feedback", label: `Feedback${submittedFeedback.length > 0 ? ` (${submittedFeedback.length})` : ""}` },
              ...(c.voice_screen?.status === "completed" ? [{ id: "screening", label: "Screening Call" }] : []),
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as typeof activeTab)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === t.id ? "text-white" : "text-gray-500 hover:bg-gray-100"
                }`}
                style={activeTab === t.id ? { background: VIOLET } : {}}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-5">

          {/* PROFILE TAB */}
          {activeTab === "profile" && (
            <div>
              {/* Profile Summary */}
              {c.profile_summary && (
                <Section title="Profile Summary">
                  <p className="text-sm text-gray-700 leading-relaxed">{c.profile_summary}</p>
                </Section>
              )}

              {/* Work Experience */}
              {(c.current_role || c.current_company) && (
                <Section title="Work Experience">
                  <div className="relative pl-4 border-l-2 border-violet-100 space-y-4">
                    <div className="relative">
                      <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-violet-500 border-2 border-white" />
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{c.current_role ?? "Role"}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{c.current_company ?? "Company"}</p>
                        </div>
                        {c.total_experience && (
                          <span className="text-xs text-gray-400 shrink-0">{c.total_experience}</span>
                        )}
                      </div>
                      {(c.current_ctc || c.expected_ctc) && (
                        <div className="mt-2 flex gap-3 text-xs text-gray-500">
                          {c.current_ctc && <span>Current: <span className="font-medium text-gray-700">{c.current_ctc}</span></span>}
                          {c.expected_ctc && <span>Expected: <span className="font-medium text-gray-700">{c.expected_ctc}</span></span>}
                        </div>
                      )}
                    </div>
                  </div>
                </Section>
              )}

              {/* Skills */}
              {skills.length > 0 && (
                <Section title="Skills">
                  <div className="flex flex-wrap gap-1.5">
                    {skills.map((s, i) => (
                      <span key={i} className="px-3 py-1 text-xs rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-medium">{s}</span>
                    ))}
                  </div>
                </Section>
              )}

              {/* Links */}
              {(c.linkedin_url || c.github_url || c.naukri_url) && (
                <Section title="Profiles">
                  <div className="flex flex-wrap gap-2">
                    {c.linkedin_url && (
                      <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>
                        LinkedIn ↗
                      </a>
                    )}
                    {c.github_url && (
                      <a href={c.github_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-700 text-xs font-medium hover:bg-gray-100 transition-colors">
                        GitHub ↗
                      </a>
                    )}
                    {c.naukri_url && (
                      <a href={c.naukri_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-xs font-medium hover:bg-violet-100 transition-colors">
                        Naukri ↗
                      </a>
                    )}
                  </div>
                </Section>
              )}

              {/* Contact (expandable) */}
              <Section title="Contact">
                {showContact ? (
                  <div className="space-y-1.5 text-sm text-gray-700">
                    <p>{c.email}</p>
                    {c.phone && <p>{c.phone}</p>}
                  </div>
                ) : (
                  <button
                    onClick={() => setShowContact(true)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    View Contact Details
                  </button>
                )}
              </Section>

              {/* AI Usage */}
              {(c.ai_comfort_score || c.ai_tools_used) && (
                <Section title="AI Usage">
                  {c.ai_comfort_score && <p className="text-sm text-gray-700">Comfort level: <span className="font-medium">{c.ai_comfort_score}</span></p>}
                  {c.ai_tools_used && <p className="text-sm text-gray-600 mt-1">{c.ai_tools_used}</p>}
                </Section>
              )}

              {/* AI Candidate Analysis */}
              <Section title="AI Analysis">
                {!analysis ? (
                  <button
                    onClick={generateAnalysis}
                    disabled={analysisLoading}
                    className="px-4 py-2 text-white text-xs font-semibold rounded-lg disabled:opacity-40 hover:opacity-90 transition-all"
                    style={{ background: VIOLET }}
                  >
                    {analysisLoading ? "Analysing…" : "Generate Analysis"}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl p-3 bg-green-50 border border-green-100">
                      <p className="text-xs font-bold text-green-700 mb-1.5">Opportunities</p>
                      <ul className="space-y-1">
                        {analysis.opportunities.map((o, i) => <li key={i} className="text-xs text-green-800 flex gap-1.5"><span>·</span>{o}</li>)}
                      </ul>
                    </div>
                    <div className="rounded-xl p-3 bg-red-50 border border-red-100">
                      <p className="text-xs font-bold text-red-600 mb-1.5">Watch Out</p>
                      <ul className="space-y-1">
                        {analysis.watchout.map((w, i) => <li key={i} className="text-xs text-red-700 flex gap-1.5"><span>·</span>{w}</li>)}
                      </ul>
                    </div>
                    <div className="rounded-xl p-3 bg-blue-50 border border-blue-100">
                      <p className="text-xs font-bold text-blue-600 mb-1.5">Suggestion</p>
                      <p className="text-xs text-blue-800">{analysis.suggestion}</p>
                    </div>
                  </div>
                )}
              </Section>
            </div>
          )}

          {/* FEEDBACK TAB */}
          {activeTab === "feedback" && (
            <div className="py-4">
              {feedbackRows.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-gray-400">No interview feedback yet for this candidate.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {feedbackRows.map((fb) => {
                    const isOpen = expandedRound === fb.interview_id;
                    const hasResult = fb.result?.processing_status === "done";
                    return (
                      <div key={fb.interview_id} className="rounded-xl border border-gray-200 overflow-hidden">
                        <button
                          onClick={() => setExpandedRound(isOpen ? null : fb.interview_id)}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                        >
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border" style={{ background: "rgba(124,58,237,0.08)", color: VIOLET, borderColor: "rgba(124,58,237,0.2)" }}>{fb.round}</span>
                          <span className="text-xs text-gray-500">{fb.interviewer_name}</span>
                          {hasResult && fb.result!.recommendation && (
                            <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full border ${RECO_BADGE[fb.result!.recommendation] ?? "bg-gray-50 text-gray-500 border-gray-200"}`}>
                              {fb.result!.recommendation}
                            </span>
                          )}
                          {hasResult && fb.result!.overall_score != null && (
                            <span className="text-xs font-bold text-gray-900 ml-1">{fb.result!.overall_score}<span className="text-gray-400 font-normal">/10</span></span>
                          )}
                          {!hasResult && (
                            <span className="ml-auto text-xs text-gray-400">{fb.status === "submitted" ? "Processing…" : "Awaiting"}</span>
                          )}
                          <span className="text-gray-300 text-xs">{isOpen ? "▲" : "▼"}</span>
                        </button>

                        {isOpen && hasResult && (
                          <div className="px-4 pb-4 pt-1 space-y-3 bg-gray-50/50">
                            {fb.result!.ai_summary && (
                              <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">AI Summary</p>
                                <p className="text-xs text-gray-700 leading-relaxed">{fb.result!.ai_summary}</p>
                              </div>
                            )}
                            {fb.result!.competency_scores && Object.keys(fb.result!.competency_scores).length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Competency Ratings</p>
                                <div className="space-y-2">
                                  {Object.entries(fb.result!.competency_scores).map(([skill, score]) => (
                                    <div key={skill}>
                                      <div className="flex justify-between text-xs mb-0.5">
                                        <span className="text-gray-600">{skill}</span>
                                        <span className="font-semibold text-gray-900">{score}/10</span>
                                      </div>
                                      <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full transition-all" style={{ width: `${score * 10}%`, background: VIOLET }} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {((fb.result!.strengths?.length ?? 0) > 0 || (fb.result!.concerns?.length ?? 0) > 0) && (
                              <div className="grid grid-cols-2 gap-2">
                                {(fb.result!.strengths?.length ?? 0) > 0 && (
                                  <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                                    <p className="text-xs font-semibold text-emerald-600 mb-1.5">Strengths</p>
                                    <ul className="space-y-1">
                                      {fb.result!.strengths!.map((s, i) => <li key={i} className="text-xs text-emerald-800 flex gap-1"><span>+</span>{s}</li>)}
                                    </ul>
                                  </div>
                                )}
                                {(fb.result!.concerns?.length ?? 0) > 0 && (
                                  <div className="bg-red-50 rounded-xl p-3 border border-red-100">
                                    <p className="text-xs font-semibold text-red-500 mb-1.5">Concerns</p>
                                    <ul className="space-y-1">
                                      {fb.result!.concerns!.map((c, i) => <li key={i} className="text-xs text-red-700 flex gap-1"><span>–</span>{c}</li>)}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                            {fb.result!.raw_notes && (
                              <details>
                                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">Show interviewer notes</summary>
                                <p className="mt-2 text-xs text-gray-600 font-mono whitespace-pre-wrap bg-white rounded-lg border border-gray-200 p-3 leading-relaxed">{fb.result!.raw_notes}</p>
                              </details>
                            )}
                          </div>
                        )}
                        {isOpen && !hasResult && (
                          <div className="px-4 pb-3 text-xs text-gray-400 bg-gray-50/50">
                            {fb.status === "submitted" ? "AI analysis processing…" : "Waiting for interviewer to submit feedback."}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SCREENING CALL TAB */}
          {activeTab === "screening" && c.voice_screen?.status === "completed" && (
            <div className="py-4 space-y-4">
              {c.voice_screen.ai_summary ? (
                <>
                  <div className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-center">
                      <p className="text-3xl font-bold" style={{ color: VIOLET }}>{c.voice_screen.ai_summary.combined_score}</p>
                      <p className="text-xs text-gray-400">/100</p>
                    </div>
                    <div>
                      {c.voice_screen.ai_summary.recommendation && (
                        <span className={`text-sm font-bold px-3 py-1 rounded-full border block w-fit ${
                          c.voice_screen.ai_summary.recommendation === "Strong yes" ? "bg-green-50 text-green-700 border-green-200" :
                          c.voice_screen.ai_summary.recommendation === "Yes" ? "bg-blue-50 text-blue-700 border-blue-200" :
                          c.voice_screen.ai_summary.recommendation === "Maybe" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                          "bg-red-50 text-red-600 border-red-200"
                        }`}>{c.voice_screen.ai_summary.recommendation}</span>
                      )}
                      {c.voice_screen.ai_summary.next_step && (
                        <p className="text-xs text-violet-600 mt-1">→ {c.voice_screen.ai_summary.next_step}</p>
                      )}
                    </div>
                    {c.voice_screen.duration_seconds && (
                      <span className="ml-auto text-xs text-gray-400">{Math.floor(c.voice_screen.duration_seconds / 60)}m {c.voice_screen.duration_seconds % 60}s</span>
                    )}
                  </div>
                  {c.voice_screen.ai_summary.call_summary && (
                    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Call Summary</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{c.voice_screen.ai_summary.call_summary}</p>
                    </div>
                  )}
                  {c.voice_screen.ai_summary.cv_vs_call && (
                    <div className="bg-violet-50 rounded-xl border border-violet-100 p-4">
                      <p className="text-xs font-semibold text-violet-500 uppercase tracking-wide mb-1">CV vs Call Alignment</p>
                      <p className="text-sm text-violet-900">{c.voice_screen.ai_summary.cv_vs_call}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {(c.voice_screen.ai_summary.highlights?.length ?? 0) > 0 && (
                      <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                        <p className="text-xs font-semibold text-emerald-600 mb-2">Highlights</p>
                        <ul className="space-y-1">
                          {c.voice_screen.ai_summary.highlights!.map((h, i) => <li key={i} className="text-xs text-emerald-800 flex gap-1.5"><span>✓</span>{h}</li>)}
                        </ul>
                      </div>
                    )}
                    {(c.voice_screen.ai_summary.red_flags?.length ?? 0) > 0 && (
                      <div className="bg-red-50 rounded-xl p-3 border border-red-100">
                        <p className="text-xs font-semibold text-red-500 mb-2">Red Flags</p>
                        <ul className="space-y-1">
                          {c.voice_screen.ai_summary.red_flags!.map((f, i) => <li key={i} className="text-xs text-red-600 flex gap-1.5"><span>⚠</span>{f}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                  {c.voice_screen.recording_url && (
                    <a href={c.voice_screen.recording_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
                      🎙 Listen to recording
                    </a>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-sm text-gray-400">Analysis being generated — refresh shortly.</div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer action bar ── */}
        <div className="px-5 py-3 border-t border-gray-100 bg-white flex items-center gap-2">
          <button
            onClick={() => updateStatus("shortlisted")}
            disabled={actionLoading !== null || c.status === "shortlisted"}
            className="flex-1 py-2 text-white text-xs font-semibold rounded-xl disabled:opacity-40 hover:opacity-90 transition-all"
            style={{ background: VIOLET }}
          >
            {actionLoading === "shortlisted" ? "…" : "✓ Shortlist"}
          </button>
          <button
            onClick={() => onScheduleInterview ? onScheduleInterview(c) : updateStatus("interview")}
            disabled={actionLoading !== null}
            className="flex-1 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl disabled:opacity-40 hover:bg-blue-700 transition-all"
          >
            → Schedule Interview
          </button>
          <button
            onClick={() => updateStatus("rejected")}
            disabled={actionLoading !== null || c.status === "rejected"}
            className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-semibold rounded-xl disabled:opacity-40 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            {actionLoading === "rejected" ? "…" : "✗ Reject"}
          </button>
          {c.cv_url && (
            <a
              href={c.cv_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              ↓ CV
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
