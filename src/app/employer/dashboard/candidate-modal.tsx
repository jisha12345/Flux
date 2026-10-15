"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  FileText,
  House,
  MapPin,
  Mic,
  Phone,
  X,
} from "lucide-react";

const SHIPROCKET_ORANGE = "#F26522";

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
  score?: number;
  ai_score?: number;
  ai_comfort_score?: string;
  ai_tools_used?: string;
  status: string;
  voice_screen?: VoiceScreen;
}

interface Analysis {
  opportunities: string[];
  watchout: string[];
  suggestion: string;
}

interface Props {
  candidate: Candidate | null;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
}

export default function CandidateModal({ candidate, onClose, onStatusChange }: Props) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  if (!candidate) return null;

  const c = candidate;
  const displayName = c.full_name ?? c.name ?? c.email;

  async function generateAnalysis() {
    setAnalysisLoading(true);
    try {
      const res = await fetch("/api/employer/candidate-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: c.id }),
      });
      const data = await res.json();
      setAnalysis(data);
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

  const skills = c.key_skills?.split(",").map(s => s.trim()).filter(Boolean) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto flex flex-col shadow-lg">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0" style={{ background: SHIPROCKET_ORANGE }}>
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{displayName}</h2>
              <p className="text-sm text-gray-500">
                {c.current_role}{c.current_company ? ` @ ${c.current_company}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {c.score != null && (
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: SHIPROCKET_ORANGE }}>
                {c.score}
              </div>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-6">
          {/* Info grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Contact */}
            <div className="rounded-xl border border-gray-200 p-4 space-y-2" style={{ background: "#F4F5F7" }}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</p>
              <p className="text-sm text-gray-800">{c.email}</p>
              {c.phone && <p className="text-sm text-gray-800">{c.phone}</p>}
              {c.current_location && (
                <p className="text-sm text-gray-600 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  {c.current_location}{c.preferred_location ? `, prefers ${c.preferred_location}` : ""}
                </p>
              )}
              {c.wfh_preference && (
                <p className="text-sm text-gray-600 flex items-center gap-1.5">
                  <House className="h-3.5 w-3.5 text-gray-400 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  {c.wfh_preference}
                </p>
              )}
            </div>

            {/* Experience & CTC */}
            <div className="rounded-xl border border-gray-200 p-4 space-y-2" style={{ background: "#F4F5F7" }}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Experience & CTC</p>
              {c.total_experience && <p className="text-sm text-gray-800">{c.total_experience} experience</p>}
              {c.current_ctc && <p className="text-sm text-gray-700">Current: <span className="font-medium">{c.current_ctc}</span></p>}
              {c.expected_ctc && <p className="text-sm text-gray-700">Expected: <span className="font-medium">{c.expected_ctc}</span></p>}
              {c.notice_period && <p className="text-sm text-gray-700">Notice: <span className="font-medium">{c.notice_period}</span></p>}
            </div>
          </div>

          {/* Links */}
          {(c.linkedin_url || c.github_url || c.naukri_url) && (
            <div className="flex flex-wrap gap-2">
              {c.linkedin_url && (
                <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>
                  LinkedIn
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                </a>
              )}
              {c.github_url && (
                <a href={c.github_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-700 text-xs font-medium hover:bg-gray-100 transition-colors">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"/></svg>
                  GitHub
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                </a>
              )}
              {c.naukri_url && (
                <a href={c.naukri_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 text-orange-700 text-xs font-medium hover:bg-orange-100 transition-colors">
                  Naukri
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                </a>
              )}
            </div>
          )}

          {/* Skills */}
          {skills.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s, i) => (
                  <span key={i} className="px-2.5 py-1 text-xs rounded-md bg-gray-100 text-gray-700 border border-gray-200">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Profile summary */}
          {c.profile_summary && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Profile summary</p>
              <p className="text-sm text-gray-700 leading-relaxed">{c.profile_summary}</p>
            </div>
          )}

          {/* AI Usage */}
          {(c.ai_comfort_score || c.ai_tools_used) && (
            <div className="rounded-xl border border-gray-200 p-4" style={{ background: "#F4F5F7" }}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">AI usage</p>
              {c.ai_comfort_score && <p className="text-sm text-gray-700">Comfort: <span className="font-medium">{c.ai_comfort_score}</span></p>}
              {c.ai_tools_used && <p className="text-sm text-gray-700 mt-1">{c.ai_tools_used}</p>}
            </div>
          )}

          {/* Voice Screen Results */}
          {c.voice_screen && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between" style={{ background: "rgba(242,101,34,0.06)" }}>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-sm font-semibold text-gray-900">AI voice screen</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.voice_screen.status === "completed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                  {c.voice_screen.status === "completed" ? "Completed" : "Pending call…"}
                </span>
              </div>

              {c.voice_screen.status === "completed" && (
                <div className="p-4 space-y-4">
                  {c.voice_screen.duration_seconds && (
                    <p className="text-xs text-gray-500">Call duration: {Math.floor(c.voice_screen.duration_seconds / 60)}m {c.voice_screen.duration_seconds % 60}s</p>
                  )}

                  {c.voice_screen.ai_summary ? (
                    <div className="space-y-3">
                      {c.voice_screen.ai_summary.combined_score !== undefined && (
                        <div className="flex items-center gap-3">
                          <span className="text-2xl font-bold" style={{ color: SHIPROCKET_ORANGE }}>{c.voice_screen.ai_summary.combined_score}<span className="text-sm text-gray-400 font-normal">/100</span></span>
                          {c.voice_screen.ai_summary.recommendation && (
                            <span className="text-sm font-semibold text-gray-700">{c.voice_screen.ai_summary.recommendation}</span>
                          )}
                        </div>
                      )}
                      {c.voice_screen.ai_summary.call_summary && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs font-semibold text-gray-500 mb-1">Call summary</p>
                          <p className="text-sm text-gray-700">{c.voice_screen.ai_summary.call_summary}</p>
                        </div>
                      )}
                      {c.voice_screen.ai_summary.cv_vs_call && (
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs font-semibold text-blue-600 mb-1">CV vs call alignment</p>
                          <p className="text-sm text-blue-800">{c.voice_screen.ai_summary.cv_vs_call}</p>
                        </div>
                      )}
                      {(c.voice_screen.ai_summary.highlights?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-1.5">Highlights</p>
                          <ul className="space-y-1">
                            {c.voice_screen.ai_summary.highlights!.map((h, i) => (
                              <li key={i} className="text-sm text-gray-700 flex gap-2">
                                <Check className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
                                {h}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(c.voice_screen.ai_summary.red_flags?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-1.5">Red flags</p>
                          <ul className="space-y-1">
                            {c.voice_screen.ai_summary.red_flags!.map((f, i) => (
                              <li key={i} className="text-sm text-red-600 flex gap-2">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {c.voice_screen.ai_summary.next_step && (
                        <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                          <p className="text-xs font-semibold text-orange-600 mb-1">Recommended next step</p>
                          <p className="text-sm text-orange-800">{c.voice_screen.ai_summary.next_step}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">Call completed. Generating the summary.</p>
                  )}

                  <div className="flex gap-2 pt-1">
                    {c.voice_screen.recording_url && (
                      <a href={c.voice_screen.recording_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                        <Mic className="h-3.5 w-3.5 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                        Listen to recording
                      </a>
                    )}
                    {c.voice_screen.transcript_url && (
                      <a href={c.voice_screen.transcript_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                        <FileText className="h-3.5 w-3.5 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                        View transcript
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI Analysis */}
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-900">AI analysis</p>
              {!analysis && (
                <button
                  onClick={generateAnalysis}
                  disabled={analysisLoading}
                  className="px-3 py-1.5 text-white text-xs font-semibold rounded-lg disabled:opacity-40 hover:opacity-90 transition-all"
                  style={{ background: SHIPROCKET_ORANGE }}
                >
                  {analysisLoading ? "Analysing…" : "Generate analysis"}
                </button>
              )}
            </div>

            {analysis && (
              <div className="space-y-3">
                <div className="rounded-lg p-3 bg-green-50 border border-green-100">
                  <p className="text-xs font-bold text-green-700 mb-1.5">Opportunities</p>
                  <ul className="space-y-1">
                    {analysis.opportunities.map((o, i) => (
                      <li key={i} className="text-sm text-green-800 flex gap-2"><span>·</span>{o}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg p-3 bg-red-50 border border-red-100">
                  <p className="text-xs font-bold text-red-700 mb-1.5">Watch out</p>
                  <ul className="space-y-1">
                    {analysis.watchout.map((w, i) => (
                      <li key={i} className="text-sm text-red-800 flex gap-2"><span>·</span>{w}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg p-3 bg-blue-50 border border-blue-100">
                  <p className="text-xs font-bold text-blue-700 mb-1.5">Suggestion</p>
                  <p className="text-sm text-blue-800">{analysis.suggestion}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action bar */}
        <div className="px-6 py-4 border-t border-gray-100 bg-white flex gap-3 sticky bottom-0">
          <button
            onClick={() => updateStatus("shortlisted")}
            disabled={actionLoading !== null || c.status === "shortlisted"}
            className="flex-1 py-2.5 text-white font-semibold rounded-xl text-sm disabled:opacity-40 hover:opacity-90 transition-all"
            style={{ background: SHIPROCKET_ORANGE }}
          >
            {actionLoading === "shortlisted" ? "…" : "Shortlist"}
          </button>
          <button
            onClick={() => updateStatus("interview")}
            disabled={actionLoading !== null || c.status === "interview"}
            className="flex-1 py-2.5 bg-blue-600 text-white font-semibold rounded-xl text-sm disabled:opacity-40 hover:bg-blue-700 transition-all"
          >
            {actionLoading === "interview" ? "…" : "Interview"}
          </button>
          <button
            onClick={() => updateStatus("rejected")}
            disabled={actionLoading !== null || c.status === "rejected"}
            className="flex-1 py-2.5 bg-gray-100 text-gray-600 font-semibold rounded-xl text-sm disabled:opacity-40 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            {actionLoading === "rejected" ? "…" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}
