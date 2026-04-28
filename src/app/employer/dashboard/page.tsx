"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { CandidateApplication } from "@/lib/types";

type ImportTab = "linkedin" | "paste" | "naukri" | "jdsearch";
type ActiveTab = "candidates" | "import" | "assessments" | "rankings";

interface AssessmentRow { id: string; title: string; role: string; assessment_type: string; created_at: string; jd_content: Record<string, unknown> | null; jd_brief: string | null; }
interface ScoreBreakdownItem { type: string; correct?: boolean; points_earned: number; max_points: number; feedback?: string; }
interface ResponseRow { id: string; candidate_name: string; candidate_email: string; score: number; max_score: number; submitted_at: string; assessment_id: string; flagged: boolean; violations_count: number; score_breakdown: ScoreBreakdownItem[] | null; }
interface SavedJD { id: string; title: string; department?: string; location?: string; type?: string; experience_range?: string; ctc_range?: string; about_role?: string; responsibilities?: string[]; requirements?: string[]; nice_to_have?: string[]; ai_expectations?: string; created_at: string; }
interface RankingEntry {
  candidate: CandidateApplication;
  response: ResponseRow | null;
  assessment: { id: string; title: string; role: string; department: string; jd_content: Record<string, unknown> | null } | null;
  profile_score: number;
  assessment_score: number | null;
  combined_score: number;
}
interface MatchSummary { match_score: number; recommendation: "Strong hire" | "Consider" | "Pass"; summary: string; strengths: string[]; gaps: string[]; hiring_note: string; integrity_note: string | null; }

function JDModal({ jd, title, onClose }: { jd: Record<string, unknown> | SavedJD | null; title?: string; onClose: () => void }) {
  const data = jd as Record<string, unknown> | null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-y-auto glass rounded-3xl p-6 sm:p-8 space-y-6"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">{data?.department as string || ""}</p>
            <h2 className="text-2xl font-bold">{data?.title as string || title || "Job Description"}</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 shrink-0 text-xl">×</button>
        </div>
        {data ? (
          <>
            <div className="flex flex-wrap gap-2">
              {[{ v: data.location as string, i: "📍" }, { v: data.type as string, i: "⏱" }, { v: data.experience_range as string, i: "💼" }, { v: data.ctc_range as string, i: "💰" }]
                .filter(t => t.v).map(t => (
                  <span key={t.v} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/8 rounded-full text-xs text-zinc-300">
                    {t.i} {t.v}
                  </span>
                ))}
            </div>
            {data.about_role && <p className="text-zinc-300 text-sm leading-relaxed">{data.about_role as string}</p>}
            {data.ai_expectations && (
              <div className="flex gap-3 p-4 bg-violet-500/8 border border-violet-500/20 rounded-2xl">
                <span className="text-lg shrink-0">🤖</span>
                <p className="text-zinc-300 text-sm leading-relaxed">{data.ai_expectations as string}</p>
              </div>
            )}
            {([["responsibilities", "→", "text-violet-400", "bg-violet-500/8 border-violet-500/15"],
               ["requirements", "✓", "text-blue-400", "bg-blue-500/8 border-blue-500/15"],
               ["nice_to_have", "◇", "text-zinc-400", "bg-white/3 border-white/8"]] as [string, string, string, string][])
              .map(([field, icon, color, bg]) => {
                const items = data[field] as string[];
                if (!items?.length) return null;
                return (
                  <div key={field} className="space-y-2">
                    <p className="text-zinc-500 text-xs uppercase tracking-wider">{field.replace(/_/g, " ")}</p>
                    <div className={`rounded-2xl border p-4 space-y-2 ${bg}`}>
                      {items.map((item, i) => (
                        <div key={i} className="flex gap-3 items-start">
                          <span className={`${color} text-xs mt-0.5 shrink-0 font-bold`}>{icon}</span>
                          <p className="text-zinc-300 text-sm leading-relaxed">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </>
        ) : (
          <p className="text-zinc-500 text-sm">No JD content available.</p>
        )}
      </motion.div>
    </div>
  );
}

function AssessmentsPanel() {
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [savedJDs, setSavedJDs] = useState<SavedJD[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingJD, setViewingJD] = useState<{ data: Record<string, unknown> | null; title?: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [deletingAssessment, setDeletingAssessment] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);

  const load = useCallback(async () => {
    const sb = await import("@/lib/supabase").then(m => m.getSupabase());
    const [{ data: asmts }, { data: resps }, jdsRes] = await Promise.all([
      sb.from("assessments").select("id,title,role,assessment_type,created_at,jd_content,jd_brief").eq("is_active", true).order("created_at", { ascending: false }),
      sb.from("assessment_responses").select("id,candidate_name,candidate_email,score,max_score,submitted_at,assessment_id,flagged,violations_count,score_breakdown").order("score", { ascending: false }),
      fetch("/api/jd"),
    ]);
    const jdsData = await jdsRes.json();
    setAssessments(asmts || []);
    setResponses(resps || []);
    setSavedJDs(jdsData.jds || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function removeResponse(responseId: string) {
    setRemoving(responseId);
    await fetch("/api/assessment", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response_id: responseId }) });
    setResponses(r => r.filter(x => x.id !== responseId));
    setRemoving(null);
  }

  async function deleteAssessment(assessmentId: string) {
    setDeletingAssessment(assessmentId);
    await fetch("/api/employer/assessments", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessment_id: assessmentId }) });
    setAssessments(a => a.filter(x => x.id !== assessmentId));
    setDeletingAssessment(null);
  }

  async function cleanDuplicates() {
    setCleaning(true);
    const roleMap = new Map<string, AssessmentRow[]>();
    for (const a of assessments) {
      const key = (a.role || a.title).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!roleMap.has(key)) roleMap.set(key, []);
      roleMap.get(key)!.push(a);
    }
    const toDelete: string[] = [];
    for (const group of roleMap.values()) {
      if (group.length < 2) continue;
      const sorted = [...group].sort((a, b) => responses.filter(r => r.assessment_id === b.id).length - responses.filter(r => r.assessment_id === a.id).length);
      toDelete.push(...sorted.slice(1).map(a => a.id));
    }
    for (const id of toDelete) {
      await fetch("/api/employer/assessments", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessment_id: id }) });
    }
    setAssessments(a => a.filter(x => !toDelete.includes(x.id)));
    setCleaning(false);
  }

  function getAnalysisLines(r: ResponseRow): [string, string] {
    const bd = r.score_breakdown || [];
    const mcq = bd.filter(x => x.type === "mcq");
    const written = bd.filter(x => x.type === "written" || x.type === "coding");
    const mcqCorrect = mcq.filter(x => x.correct).length;
    const line1 = mcq.length > 0 ? `${mcqCorrect}/${mcq.length} MCQ correct` : "";
    const line2 = written.find(x => x.feedback)?.feedback
      || (r.score >= 75 ? "Strong performance across all sections." : r.score >= 50 ? "Solid attempt — some gaps in written responses." : "Limited depth in written answers.");
    return [line1, line2];
  }

  const hasDuplicates = (() => {
    const seen = new Set<string>();
    for (const a of assessments) {
      const key = (a.role || a.title).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  })();

  return (
    <div className="p-4 sm:p-6 space-y-8">
      {/* Saved JDs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white text-lg">Job Descriptions</h3>
          <Link href="/employer/jd-builder" className="text-xs text-violet-400 hover:text-violet-300 transition-colors">+ Create JD →</Link>
        </div>
        {loading ? <div className="text-zinc-600 text-sm">Loading...</div> : savedJDs.length === 0 ? (
          <div className="glass rounded-xl p-5 text-center text-zinc-600 text-sm">No JDs saved yet. Go to JD Builder to create one.</div>
        ) : (
          <div className="grid gap-2">
            {savedJDs.map(jd => (
              <div key={jd.id} className="glass rounded-xl p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{jd.title}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">{jd.department || "—"} · {jd.location || "—"} · {new Date(jd.created_at).toLocaleDateString("en-IN")}</p>
                </div>
                <button onClick={() => setViewingJD({ data: jd as unknown as Record<string, unknown>, title: jd.title })}
                  className="text-xs px-3 py-1.5 glass rounded-lg text-zinc-400 hover:text-white transition-all shrink-0">
                  Open JD
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assessments */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-white text-lg">Screening Assessments</h3>
          {hasDuplicates && (
            <button onClick={cleanDuplicates} disabled={cleaning}
              className="text-xs px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/15 rounded-lg transition-all disabled:opacity-40">
              {cleaning ? "Cleaning..." : "Remove duplicates"}
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse h-24 glass rounded-2xl" />)}</div>
        ) : assessments.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center text-zinc-600 text-sm">No assessments yet. Go to JD Builder → Generate screening test.</div>
        ) : (
          <div className="space-y-3">
            {assessments.map(a => {
              const aResponses = responses.filter(r => r.assessment_id === a.id);
              return (
                <div key={a.id} className="glass rounded-2xl overflow-hidden border border-white/5">
                  {/* Assessment header */}
                  <div className="px-4 py-3 flex items-center gap-3 border-b border-white/5">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{a.role || a.title}</p>
                      <p className="text-zinc-600 text-xs mt-0.5 capitalize">{a.assessment_type} · {aResponses.length} candidate{aResponses.length !== 1 ? "s" : ""} · {new Date(a.created_at).toLocaleDateString("en-IN")}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {a.jd_content && (
                        <button onClick={() => setViewingJD({ data: a.jd_content, title: a.title })}
                          className="text-xs px-2.5 py-1 glass rounded-lg text-zinc-500 hover:text-white transition-all">
                          JD
                        </button>
                      )}
                      <button onClick={() => deleteAssessment(a.id)} disabled={deletingAssessment === a.id}
                        className="text-zinc-700 hover:text-red-400 transition-colors text-lg leading-none disabled:opacity-30 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10"
                        title="Delete this assessment">
                        {deletingAssessment === a.id ? "·" : "×"}
                      </button>
                    </div>
                  </div>

                  {/* Candidate rows — always visible, sorted by score */}
                  {aResponses.length === 0 ? (
                    <div className="px-4 py-3 text-zinc-700 text-xs italic">No responses yet.</div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {aResponses.map(r => {
                        const [line1, line2] = getAnalysisLines(r);
                        const scoreColor = r.score >= 75 ? "text-green-400" : r.score >= 50 ? "text-yellow-400" : "text-zinc-500";
                        const scoreBg = r.score >= 75 ? "bg-green-500/10 border-green-500/20" : r.score >= 50 ? "bg-yellow-500/10 border-yellow-500/20" : "bg-white/3 border-white/8";
                        return (
                          <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                            <div className={`rounded-lg border px-2 py-1 text-center shrink-0 min-w-[44px] ${scoreBg}`}>
                              <p className={`text-sm font-bold leading-none ${scoreColor}`}>{r.score}</p>
                              <p className="text-[9px] text-zinc-700 leading-none mt-0.5">/100</p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-white text-sm font-medium">{r.candidate_name}</p>
                                {r.flagged && <span className="text-[10px] px-1.5 py-0.5 bg-red-500/15 border border-red-500/20 text-red-400 rounded-full">⚠ Flagged</span>}
                                {r.violations_count > 0 && <span className="text-[10px] text-red-400">{r.violations_count} violation{r.violations_count > 1 ? "s" : ""}</span>}
                              </div>
                              {line1 && <p className="text-zinc-600 text-xs mt-0.5">{line1}</p>}
                              <p className="text-zinc-500 text-xs mt-0.5 line-clamp-1 leading-relaxed">{line2}</p>
                            </div>
                            <button onClick={() => removeResponse(r.id)} disabled={removing === r.id}
                              className="text-zinc-700 hover:text-red-400 transition-colors text-base leading-none disabled:opacity-40 shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/10"
                              title="Remove candidate">
                              {removing === r.id ? "·" : "×"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {viewingJD && <JDModal jd={viewingJD.data} title={viewingJD.title} onClose={() => setViewingJD(null)} />}
      </AnimatePresence>
    </div>
  );
}

function RankingsPanel() {
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [allAssessments, setAllAssessments] = useState<AssessmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAssessment, setFilterAssessment] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, MatchSummary | "loading" | "error">>({});

  useEffect(() => {
    fetch("/api/employer/rankings")
      .then(r => r.json())
      .then(d => {
        setRankings(d.rankings || []);
        setAllAssessments(d.assessments || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function loadSummary(entry: RankingEntry) {
    const key = entry.candidate.id!;
    if (summaries[key]) return;
    setSummaries(s => ({ ...s, [key]: "loading" }));
    try {
      const res = await fetch("/api/employer/match-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate: entry.candidate, response: entry.response, assessment: entry.assessment }),
      });
      const data = await res.json();
      setSummaries(s => ({ ...s, [key]: data.success ? data.summary : "error" }));
    } catch {
      setSummaries(s => ({ ...s, [key]: "error" }));
    }
  }

  function toggleExpand(entry: RankingEntry) {
    const key = entry.candidate.id!;
    if (expanded === key) { setExpanded(null); return; }
    setExpanded(key);
    loadSummary(entry);
  }

  const filtered = filterAssessment === "all"
    ? rankings
    : rankings.filter(r => r.assessment?.id === filterAssessment || r.response?.assessment_id === filterAssessment);

  const MEDALS = ["🥇", "🥈", "🥉"];
  const REC_STYLES: Record<string, string> = {
    "Strong hire": "bg-green-500/15 text-green-400 border border-green-500/20",
    "Consider": "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
    "Pass": "bg-red-500/15 text-red-400 border border-red-500/20",
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-semibold text-white text-lg mb-1">Candidate Rankings</h3>
          <p className="text-zinc-500 text-sm">AI match scoring: 40% profile · 60% assessment. Click any candidate for full analysis.</p>
        </div>
        {allAssessments.length > 0 && (
          <select value={filterAssessment} onChange={e => setFilterAssessment(e.target.value)}
            className="bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white outline-none shrink-0">
            <option value="all">All assessments</option>
            {allAssessments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="animate-pulse h-16 glass rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-zinc-600 text-sm">
          No candidates to rank yet. Import profiles or have candidates complete assessments.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry, idx) => {
            const key = entry.candidate.id!;
            const summary = summaries[key];
            const isExpanded = expanded === key;
            const hasTest = entry.assessment_score !== null;
            const scoreColor = entry.combined_score >= 75 ? "text-green-400" : entry.combined_score >= 50 ? "text-yellow-400" : "text-zinc-400";
            const borderColor = entry.combined_score >= 75 ? "border-green-500/30" : entry.combined_score >= 50 ? "border-yellow-500/20" : "border-white/8";

            return (
              <div key={key} className={`glass rounded-2xl overflow-hidden border transition-all ${isExpanded ? borderColor : "border-white/5"}`}>
                {/* Main row */}
                <button className="w-full text-left px-4 sm:px-5 py-4 flex items-center gap-3 sm:gap-4 hover:bg-white/2 transition-colors"
                  onClick={() => toggleExpand(entry)}>
                  {/* Rank */}
                  <div className="text-lg w-7 shrink-0 text-center">
                    {idx < 3 ? MEDALS[idx] : <span className="text-zinc-600 text-sm font-mono">{idx + 1}</span>}
                  </div>

                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                    {entry.candidate.full_name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white text-sm font-medium">{entry.candidate.full_name}</p>
                      {entry.response?.flagged && <span className="text-[10px] px-1.5 py-0.5 bg-red-500/15 text-red-400 rounded-full border border-red-500/20">⚠ Flagged</span>}
                      {summary && typeof summary === "object" && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${REC_STYLES[summary.recommendation]}`}>{summary.recommendation}</span>
                      )}
                    </div>
                    <p className="text-zinc-500 text-xs truncate mt-0.5">{entry.candidate.current_role} · {entry.candidate.current_company}</p>
                  </div>

                  {/* Scores */}
                  <div className="hidden sm:flex items-center gap-3 shrink-0 text-right">
                    <div className="text-center">
                      <p className="text-zinc-600 text-[10px]">Profile</p>
                      <p className="text-zinc-300 text-xs font-medium">{entry.profile_score}</p>
                    </div>
                    {hasTest ? (
                      <div className="text-center">
                        <p className="text-zinc-600 text-[10px]">Test</p>
                        <p className="text-zinc-300 text-xs font-medium">{entry.assessment_score}</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-zinc-600 text-[10px]">Test</p>
                        <p className="text-zinc-700 text-xs">—</p>
                      </div>
                    )}
                    <div className="text-center w-12">
                      <p className="text-zinc-600 text-[10px]">Match</p>
                      <p className={`text-base font-bold ${scoreColor}`}>{entry.combined_score}</p>
                    </div>
                  </div>
                  <div className={`sm:hidden text-base font-bold shrink-0 ${scoreColor}`}>{entry.combined_score}</div>

                  <span className={`text-zinc-600 text-sm transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`}>›</span>
                </button>

                {/* Expanded summary */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t border-white/5">
                      <div className="px-4 sm:px-5 py-5">
                        {summary === "loading" ? (
                          <div className="flex items-center gap-2 text-zinc-500 text-sm">
                            <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                            Generating AI match analysis...
                          </div>
                        ) : summary === "error" ? (
                          <p className="text-red-400 text-sm">Failed to generate analysis. Check Anthropic API key.</p>
                        ) : summary ? (
                          <div className="space-y-4">
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className="relative w-16 h-16 shrink-0">
                                <svg className="w-full h-full" viewBox="0 0 36 36">
                                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#27272a" strokeWidth="2.5" />
                                  <circle cx="18" cy="18" r="15.9" fill="none"
                                    stroke={summary.match_score >= 75 ? "#22c55e" : summary.match_score >= 50 ? "#f59e0b" : "#6366f1"}
                                    strokeWidth="2.5" strokeDasharray={`${summary.match_score} 100`} strokeLinecap="round"
                                    style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }} />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                  <span className="text-sm font-bold leading-none">{summary.match_score}</span>
                                  <span className="text-zinc-600 text-[9px] leading-none mt-0.5">/100</span>
                                </div>
                              </div>
                              <div>
                                <span className={`text-sm px-3 py-1.5 rounded-full font-semibold ${REC_STYLES[summary.recommendation]}`}>{summary.recommendation}</span>
                                <p className="text-zinc-400 text-sm mt-2 leading-relaxed max-w-xl">{summary.summary}</p>
                              </div>
                            </div>
                            <div className="grid sm:grid-cols-2 gap-3">
                              {summary.strengths.length > 0 && (
                                <div className="bg-green-500/5 border border-green-500/15 rounded-xl p-4 space-y-1.5">
                                  <p className="text-green-400 text-xs font-semibold uppercase tracking-wider">Strengths</p>
                                  {summary.strengths.map((s, i) => (
                                    <div key={i} className="flex gap-2 items-start"><span className="text-green-500 text-xs shrink-0 mt-0.5">✓</span><p className="text-zinc-300 text-xs leading-relaxed">{s}</p></div>
                                  ))}
                                </div>
                              )}
                              {summary.gaps.length > 0 && (
                                <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4 space-y-1.5">
                                  <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider">Gaps</p>
                                  {summary.gaps.map((g, i) => (
                                    <div key={i} className="flex gap-2 items-start"><span className="text-amber-500 text-xs shrink-0 mt-0.5">⚡</span><p className="text-zinc-300 text-xs leading-relaxed">{g}</p></div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex items-start gap-2 p-3 bg-blue-500/5 border border-blue-500/15 rounded-xl">
                              <span className="text-blue-400 text-xs shrink-0 mt-0.5">→</span>
                              <p className="text-zinc-300 text-xs leading-relaxed">{summary.hiring_note}</p>
                            </div>
                            {summary.integrity_note && (
                              <div className="flex items-start gap-2 p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
                                <span className="text-red-400 text-xs shrink-0 mt-0.5">⚠</span>
                                <p className="text-zinc-300 text-xs leading-relaxed">{summary.integrity_note}</p>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface SearchedProfile { name?: string; role?: string; company?: string; skills?: string[]; location?: string; url: string; title?: string; snippet?: string; total_experience?: string; experience_years?: number; jd_relevance?: string; pageText?: string; }

function JDSearchPanel({ onImported }: { onImported: () => void }) {
  const [jds, setJDs] = useState<SavedJD[]>([]);
  const [selectedJD, setSelectedJD] = useState<string>("");
  const [platforms, setPlatforms] = useState({ linkedin: true, github: false, naukri: false, iimjobs: false, hirist: false });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchedProfile[]>([]);
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [meta, setMeta] = useState<Record<string, boolean | number> | null>(null);

  useEffect(() => {
    fetch("/api/jd").then(r => r.json()).then(d => setJDs(d.jds || []));
  }, []);

  async function search() {
    const jd = jds.find(j => j.id === selectedJD);
    if (!jd) return;
    setLoading(true);
    setResults([]);
    const activePlatforms = Object.entries(platforms).filter(([, v]) => v).map(([k]) => k);
    try {
      const res = await fetch("/api/search-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: jd.title,
          skills: jd.requirements?.slice(0, 5) || [],
          location: jd.location || "India",
          platforms: activePlatforms,
          jd_brief: jd.about_role || "",
          jd_requirements: jd.requirements || [],
          jd_experience: jd.experience_range || "",
        }),
      });
      const data = await res.json();
      setMeta(data.meta || null);
      // Prefer parsed profiles (have real name/data); fall back to raw URLs
      const parsedUrls = new Set((data.parsed || []).map((p: SearchedProfile) => p.url));
      const combined: SearchedProfile[] = [
        ...(data.parsed || []).map((p: SearchedProfile & { pageText?: string }) => ({ ...p, url: p.url || "" })),
        ...(data.urls || []).filter((u: SearchedProfile) => !parsedUrls.has(u.url)),
      ];
      setResults(combined);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }

  async function importProfile(profile: SearchedProfile & { pageText?: string }) {
    if (importing.has(profile.url) || imported.has(profile.url)) return;
    setImporting(s => new Set([...s, profile.url]));
    try {
      // Use full page text if available, otherwise build from fields
      const text = (profile as { pageText?: string }).pageText?.trim() ||
        [profile.name, `${profile.role || ""} at ${profile.company || ""}`, `Skills: ${(profile.skills || []).join(", ")}`, `Location: ${profile.location || ""}`, `Profile URL: ${profile.url}`, profile.snippet || ""]
          .filter(Boolean).join("\n");
      const res = await fetch("/api/parse-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source: "search" }),
      });
      const data = await res.json();
      if (data.success) { setImported(s => new Set([...s, profile.url])); onImported(); }
    } catch { /* ignore */ }
    finally { setImporting(s => { const n = new Set(s); n.delete(profile.url); return n; }); }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-zinc-400 text-xs">Select a JD to search for matching candidates across job platforms. Claude generates smart search queries based on the role requirements.</p>
        {meta && !meta.serper_configured && (
          <p className="text-amber-500/80 text-xs">Add <code className="text-amber-400">SERPER_API_KEY</code> for better results — free at serper.dev (2500 queries/month, no card).</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-zinc-600 text-xs uppercase tracking-wider">Select JD</p>
        <select value={selectedJD} onChange={e => setSelectedJD(e.target.value)}
          className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500/40">
          <option value="">Choose a job description...</option>
          {jds.map(j => <option key={j.id} value={j.id}>{j.title} · {j.department}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <p className="text-zinc-600 text-xs uppercase tracking-wider">Platforms</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(platforms) as (keyof typeof platforms)[]).map(p => (
            <label key={p} className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all text-sm ${platforms[p] ? "border-violet-500/40 bg-violet-500/10 text-violet-300" : "border-white/8 text-zinc-500 hover:text-zinc-300"}`}>
              <input type="checkbox" checked={platforms[p]} onChange={e => setPlatforms(pl => ({ ...pl, [p]: e.target.checked }))} className="hidden" />
              {p === "linkedin" ? "🔗 LinkedIn" : p === "github" ? "🐙 GitHub" : p === "naukri" ? "🇮🇳 Naukri" : p === "iimjobs" ? "🎓 iimjobs" : "💻 Hirist"}
            </label>
          ))}
        </div>
      </div>

      <button onClick={search} disabled={loading || !selectedJD}
        className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-30 transition-all">
        {loading ? "Searching job boards..." : "Search for candidates →"}
      </button>

      {results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-zinc-500 text-xs uppercase tracking-wider">{results.length} profiles found</p>
            <button onClick={() => results.forEach(importProfile)}
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
              Import all →
            </button>
          </div>
          {results.map((r, i) => (
            <div key={i} className="glass rounded-2xl p-4 space-y-2.5">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold leading-snug">{r.name || r.title || r.url.split("/").pop()?.replace(/-/g, " ")}</p>
                  <p className="text-zinc-400 text-xs mt-0.5 truncate">{[r.role, r.company].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <button onClick={() => importProfile(r)} disabled={importing.has(r.url) || imported.has(r.url)}
                  className={`text-xs px-3 py-1.5 rounded-lg shrink-0 transition-all font-medium ${imported.has(r.url) ? "bg-green-500/15 text-green-400 border border-green-500/20" : "bg-violet-500/15 text-violet-300 border border-violet-500/20 hover:bg-violet-500/25 disabled:opacity-40"}`}>
                  {imported.has(r.url) ? "✓ Added" : importing.has(r.url) ? "Importing..." : "Import"}
                </button>
              </div>

              {/* Data pills */}
              <div className="flex flex-wrap gap-1.5">
                {r.total_experience && (
                  <span className="text-xs px-2 py-1 bg-white/5 border border-white/8 rounded-lg text-zinc-300">
                    🕐 {r.total_experience} total
                  </span>
                )}
                {r.jd_relevance && (
                  <span className="text-xs px-2 py-1 bg-violet-500/10 border border-violet-500/20 rounded-lg text-violet-300">
                    ✦ {r.jd_relevance}
                  </span>
                )}
                {r.location && (
                  <span className="text-xs px-2 py-1 bg-white/5 border border-white/8 rounded-lg text-zinc-400">
                    📍 {r.location}
                  </span>
                )}
              </div>

              {/* Skills */}
              {r.skills?.length ? (
                <p className="text-zinc-600 text-xs truncate">{r.skills.slice(0, 5).join(" · ")}</p>
              ) : null}

              <a href={r.url} target="_blank" rel="noopener noreferrer"
                className="text-zinc-700 text-[10px] truncate hover:text-zinc-500 transition-colors block">
                {r.url.replace("https://www.", "").replace("https://", "")}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImportPanel({ onImported }: { onImported: () => void }) {
  const [tab, setTab] = useState<ImportTab>("linkedin");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ label: string; success: boolean; name?: string; error?: string }[]>([]);

  async function handleLinkedIn() {
    const list = text.split("\n").map(u => u.trim()).filter(Boolean);
    if (!list.length) return;
    setLoading(true);
    setResults([]);
    try {
      const res = await fetch("/api/scrape", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: list }),
      });
      const data = await res.json();
      setResults((data.results || []).map((r: { url: string; success: boolean; candidate?: { full_name?: string }; error?: string }) => ({
        label: r.url, success: r.success, name: r.candidate?.full_name, error: r.error,
      })));
      if (data.results?.some((r: { success: boolean }) => r.success)) onImported();
    } catch {
      setResults([{ label: "Batch import", success: false, error: "Request failed" }]);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasteProfile(source: string) {
    if (!text.trim()) return;
    setLoading(true);
    setResults([]);
    try {
      const res = await fetch("/api/parse-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source }),
      });
      const data = await res.json();
      if (data.success) {
        setResults([{ label: data.candidate?.full_name || "Profile", success: true, name: data.candidate?.full_name }]);
        onImported();
      } else {
        setResults([{ label: "Import", success: false, error: data.error }]);
      }
    } catch {
      setResults([{ label: "Import", success: false, error: "Request failed" }]);
    } finally {
      setLoading(false);
    }
  }

  const TABS: { id: ImportTab; label: string; badge?: string }[] = [
    { id: "jdsearch", label: "Search by JD", badge: "AI" },
    { id: "linkedin", label: "LinkedIn" },
    { id: "paste",    label: "Paste Profile", badge: "Any portal" },
    { id: "naukri",   label: "Naukri / iimjobs" },
  ];

  const placeholders: Record<ImportTab, string> = {
    jdsearch: "",
    linkedin: "https://linkedin.com/in/profile-one\nhttps://linkedin.com/in/profile-two",
    paste: "Paste the full profile text here — name, experience, skills, education, CTC...\n\nWorks with any portal.",
    naukri: "Copy the candidate profile page text from Naukri or iimjobs and paste it here.\n\nTip: Select all text on the profile page (Ctrl+A), copy, paste below.",
  };

  const descriptions: Record<ImportTab, string> = {
    jdsearch: "",
    linkedin: "Paste LinkedIn profile URLs (one per line). Powered by Scrapingdog + Claude.",
    paste: "Copy any profile text from any portal and Claude will extract and structure the candidate data automatically.",
    naukri: "Open any Naukri or iimjobs candidate profile, copy all the text, and paste it here. Claude will parse it into a structured profile.",
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-2xl">
      <div>
        <h3 className="font-semibold text-white text-lg mb-1">Import Candidates</h3>
        <p className="text-zinc-500 text-sm">Pull in talent from any source — LinkedIn, Naukri, iimjobs, or any portal.</p>
      </div>

      <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setText(""); setResults([]); }}
            className={`px-3 py-2 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${tab === t.id ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
            {t.label}
            {t.badge && <span className="text-zinc-600 text-[10px]">{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === "jdsearch" ? (
        <JDSearchPanel onImported={onImported} />
      ) : (
        <>
          <p className="text-zinc-600 text-xs">{descriptions[tab]}</p>
          <textarea
            rows={7}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={placeholders[tab]}
            className="w-full bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-white placeholder-zinc-700 outline-none focus:border-violet-500/40 resize-none text-sm font-mono leading-relaxed"
          />
          <button
            onClick={() => tab === "linkedin" ? handleLinkedIn() : handlePasteProfile(tab === "naukri" ? "naukri" : "paste")}
            disabled={loading || !text.trim()}
            className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-30 transition-all"
          >
            {loading ? "Importing & scoring with AI..." : tab === "linkedin" ? "Import from LinkedIn →" : "Parse & import profile →"}
          </button>
          {results.length > 0 && (
            <div className="space-y-1.5">
              {results.map((r, i) => (
                <div key={i} className={`text-xs px-3 py-2.5 rounded-xl flex items-center gap-2 ${r.success ? "bg-green-500/10 text-green-400 border border-green-500/15" : "bg-red-500/10 text-red-400 border border-red-500/15"}`}>
                  <span>{r.success ? "✓" : "✗"}</span>
                  <span className="truncate">{r.name || r.label}</span>
                  {r.success && <span className="text-green-600 ml-auto shrink-0">Added to pipeline</span>}
                  {r.error && <span className="text-zinc-600 ml-auto shrink-0 truncate max-w-[200px]">{r.error}</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

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
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-bold leading-none" style={{ color }}>{score}</span>
        <span className="text-zinc-600 text-[8px] leading-none mt-0.5">/100</span>
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
  const [activeTab, setActiveTab] = useState<ActiveTab>("candidates");
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
      <button onClick={() => { setActiveTab("candidates"); onClick?.(); }} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full text-left transition-all ${activeTab === "candidates" ? "bg-white/5 text-white" : "text-zinc-500 hover:text-white hover:bg-white/5"}`}>
        <span>🏠</span> Dashboard
      </button>
      <button onClick={() => { setActiveTab("rankings"); onClick?.(); }} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full text-left transition-all ${activeTab === "rankings" ? "bg-white/5 text-white" : "text-zinc-500 hover:text-white hover:bg-white/5"}`}>
        <span>🏆</span> Rankings
      </button>
      <button onClick={() => { setActiveTab("import"); onClick?.(); }} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full text-left transition-all ${activeTab === "import" ? "bg-white/5 text-white" : "text-zinc-500 hover:text-white hover:bg-white/5"}`}>
        <span>📥</span> Import Candidates
      </button>
      <button onClick={() => { setActiveTab("assessments"); onClick?.(); }} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full text-left transition-all ${activeTab === "assessments" ? "bg-white/5 text-white" : "text-zinc-500 hover:text-white hover:bg-white/5"}`}>
        <span>🧪</span> Assessments
      </button>
      <Link href="/employer/jd-builder" onClick={onClick} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-zinc-500 hover:text-white hover:bg-white/5 text-sm transition-all">
        <span>✍️</span> JD Builder
      </Link>
    </>
  );

  const TAB_LABELS: Record<ActiveTab, string> = {
    candidates: "Dashboard",
    rankings: "Rankings",
    import: "Import Candidates",
    assessments: "Assessments",
  };

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-60 border-r border-white/5 flex-col p-5 gap-5 shrink-0">
        <Link href="/" className="text-2xl font-black gradient-text drop-shadow-lg px-3">Flux</Link>
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
          <h1 className="font-semibold">{TAB_LABELS[activeTab]}</h1>
          <span className="ml-auto text-zinc-600 text-xs">{candidates.length} total</span>
        </div>

        {activeTab === "import" && (
          <div className="flex-1 overflow-y-auto">
            <ImportPanel onImported={() => { setActiveTab("candidates"); fetchCandidates(); }} />
          </div>
        )}

        {activeTab === "assessments" && (
          <div className="flex-1 overflow-y-auto">
            <AssessmentsPanel />
          </div>
        )}

        {activeTab === "rankings" && (
          <div className="flex-1 overflow-y-auto">
            <RankingsPanel />
          </div>
        )}

        {activeTab === "candidates" && <>
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
                      <p className="text-zinc-400 text-xs truncate mt-0.5">{c.current_role} · {c.current_company}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {c.total_experience && <span className="text-zinc-600 text-xs">{c.total_experience}y exp</span>}
                        {c.current_location && <span className="text-zinc-700 text-xs truncate">· {c.current_location}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[c.status || "new"]}`}>{c.status || "new"}</span>
                      </div>
                    </div>
                    <ScoreRing score={c.score || 0} />
                  </button>
                ))}
              </div>
            )}
          </div>

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
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-sm font-bold leading-none">{selected.score}</span>
                        <span className="text-zinc-600 text-[9px] leading-none mt-0.5">/100</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-zinc-600 text-xs w-full sm:w-auto">Move to:</span>
                    {STATUS_OPTIONS.map((s) => (
                      <button key={s} onClick={() => updateStatus(selected.id!, s)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-all ${selected.status === s ? STATUS_STYLES[s] + " font-semibold" : "border-white/8 text-zinc-600 hover:text-white hover:border-white/15"}`}>
                        {s}
                      </button>
                    ))}
                  </div>

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
        </>}
      </div>
    </div>
  );
}
