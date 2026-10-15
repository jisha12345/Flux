"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface SourcingCandidate {
  id: string;
  full_name?: string;
  current_role?: string;
  linkedin_url?: string;
  job_id?: string;
}

const OR = "#7C3AED";

interface Job {
  id: string;
  title: string;
  description?: string;
}

interface ScreenResult {
  name: string;
  email: string;
  phone?: string;
  current_role?: string;
  score: number;
  summary: string;
  dimensions: Record<string, number>;
  strengths: string[];
  gaps: string[];
  recommendation: "Strong yes" | "Yes" | "Maybe" | "No";
  _fileName?: string;
}

interface CallTarget {
  name: string;
  phone: string;
  fromCVResult?: boolean;
  resultRef?: ScreenResult;
}

const REC_COLOR: Record<string, string> = {
  "Strong yes": "text-green-600",
  "Yes": "text-blue-600",
  "Maybe": "text-yellow-600",
  "No": "text-red-600",
};

const REC_BADGE: Record<string, string> = {
  "Strong yes": "bg-green-50 text-green-700 border-green-200",
  "Yes": "bg-blue-50 text-blue-700 border-blue-200",
  "Maybe": "bg-yellow-50 text-yellow-700 border-yellow-200",
  "No": "bg-red-50 text-red-600 border-red-200",
};

export default function CVScreener({ jobs: initialJobs, onCandidateScreened }: { jobs: Job[]; onCandidateScreened?: () => void }) {
  const [jobList, setJobList] = useState<Job[]>(initialJobs);
  const [selectedJob, setSelectedJob] = useState(initialJobs[0]?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ScreenResult[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const [sourcedQueue, setSourcedQueue] = useState<SourcingCandidate[]>([]);

  useEffect(() => {
    fetch("/api/candidates?sourced=true")
      .then(r => r.json())
      .then(d => setSourcedQueue(d.candidates ?? []))
      .catch(() => null);
  }, []);

  function buildReportHTML(rows: ScreenResult[], title = "CV Screening Report") {
    const dimLabel: Record<string, string> = {
      skills_match: "Skills Match",
      experience_relevance: "Experience Relevance",
      impact_clarity: "Impact & Clarity",
      company_calibre: "Company Calibre",
      growth_trajectory: "Growth Trajectory",
      technical_depth: "Technical Depth",
      ai_fluency: "AI Fluency",
    };
    const recColor: Record<string, string> = {
      "Strong yes": "#16a34a", "Yes": "#2563eb", "Maybe": "#d97706", "No": "#dc2626",
    };
    const cards = rows.map(r => `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="name">${r.name ?? "—"}</div>
            <div class="role">${r.current_role ?? ""}</div>
            ${r.email ? `<div class="meta">${r.email}${r.phone ? " · " + r.phone : ""}</div>` : ""}
          </div>
          <div class="score-block">
            <div class="score">${r.score ?? "—"}<span>/100</span></div>
            <div class="rec" style="color:${recColor[r.recommendation] ?? "#374151"}">${r.recommendation}</div>
          </div>
        </div>
        <div class="summary">${r.summary ?? ""}</div>
        <div class="section-title">Dimension Scores</div>
        <div class="dims">
          ${Object.entries(r.dimensions ?? {}).map(([k, v]) => `
            <div class="dim-row">
              <div class="dim-label">${dimLabel[k] ?? k}</div>
              <div class="bar-wrap"><div class="bar" style="width:${v}%;background:${v >= 70 ? "#16a34a" : v >= 45 ? "#d97706" : "#dc2626"}"></div></div>
              <div class="dim-val">${v}</div>
            </div>`).join("")}
        </div>
        <div class="two-col">
          <div>
            <div class="section-title">Strengths</div>
            <ul>${(r.strengths ?? []).map(s => `<li>${s}</li>`).join("")}</ul>
          </div>
          <div>
            <div class="section-title">Gaps</div>
            <ul class="gaps">${(r.gaps ?? []).map(g => `<li>${g}</li>`).join("")}</ul>
          </div>
        </div>
      </div>`).join("");

    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title><style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;color:#111;padding:32px;background:#f9fafb}
      .header{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #7C3AED}
      .logo{font-size:18px;font-weight:700;color:#111827}.logo span{color:#7C3AED}
      .report-title{font-size:13px;color:#6b7280}
      .date{font-size:11px;color:#9ca3af;margin-top:2px}
      .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:20px;page-break-inside:avoid}
      .card-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
      .name{font-size:16px;font-weight:700;color:#111}
      .role{font-size:12px;color:#6b7280;margin-top:2px}
      .meta{font-size:11px;color:#9ca3af;margin-top:2px}
      .score-block{text-align:right}
      .score{font-size:28px;font-weight:800;color:#7C3AED}.score span{font-size:13px;font-weight:400;color:#9ca3af}
      .rec{font-size:12px;font-weight:600;margin-top:2px}
      .summary{font-size:12px;color:#374151;line-height:1.6;margin-bottom:14px;padding:10px 12px;background:#f9fafb;border-radius:8px}
      .section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-bottom:8px;margin-top:14px}
      .dims{display:flex;flex-direction:column;gap:6px}
      .dim-row{display:flex;align-items:center;gap:8px}
      .dim-label{width:160px;font-size:11px;color:#374151;flex-shrink:0}
      .bar-wrap{flex:1;height:6px;background:#e5e7eb;border-radius:99px;overflow:hidden}
      .bar{height:100%;border-radius:99px;transition:width .3s}
      .dim-val{width:28px;text-align:right;font-size:11px;font-weight:600;color:#374151}
      .two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:4px}
      ul{list-style:none;display:flex;flex-direction:column;gap:4px}
      li{font-size:11px;color:#374151;padding-left:12px;position:relative}
      li::before{content:"•";position:absolute;left:0;color:#7C3AED}
      .gaps li::before{color:#dc2626}
      @media print{body{padding:0;background:#fff}.card{border:1px solid #ddd;box-shadow:none}}
    </style></head><body>
      <div class="header">
        <div><div class="logo">Reqr <span>by Shiprocket</span></div><div class="report-title">${title}</div></div>
        <div class="date">Generated ${new Date().toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" })}</div>
      </div>
      ${cards}
    </body></html>`;
  }

  function downloadReport(rows: ScreenResult[]) {
    const html = buildReportHTML(rows, rows.length === 1 ? `${rows[0].name ?? "Candidate"} — Screening Report` : "CV Screening Report");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  }

  // Twenty2 modal
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [callTarget, setCallTarget] = useState<CallTarget>({ name: "", phone: "" });
  const [callingAI, setCallingAI] = useState(false);
  const [callTriggered, setCallTriggered] = useState(false);
  const [callError, setCallError] = useState("");

  function openCallModal(prefill?: Partial<CallTarget>) {
    setCallTarget({ name: prefill?.name ?? "", phone: prefill?.phone ?? "", resultRef: prefill?.resultRef });
    setCallTriggered(false);
    setCallError("");
    setCallModalOpen(true);
  }

  async function screenFile(file: File, jobId: string): Promise<ScreenResult> {
    const form = new FormData();
    form.append("cv", file);
    form.append("job_id", jobId);
    const res = await fetch("/api/screen-cv", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Screening failed");
    return { ...data.result, _fileName: file.name };
  }

  async function screen() {
    if (!files.length || !selectedJob) return;
    setLoading(true);
    setError("");
    setResults([]);
    setExpanded(null);
    setProgress({ done: 0, total: files.length });

    const settled = await Promise.allSettled(
      files.map(async (f) => {
        const r = await screenFile(f, selectedJob);
        setProgress(p => ({ ...p, done: p.done + 1 }));
        return r;
      })
    );

    const ok: ScreenResult[] = [];
    const errs: string[] = [];
    settled.forEach((s, i) => {
      if (s.status === "fulfilled") ok.push(s.value);
      else errs.push(`${files[i].name}: ${(s.reason as Error).message}`);
    });

    ok.sort((a, b) => b.score - a.score);
    setResults(ok);
    if (errs.length) setError(errs.join(" · "));
    setLoading(false);
    if (ok.length > 0) onCandidateScreened?.();
  }

  async function triggerVoiceScreen() {
    if (!callTarget.phone.trim()) return;
    setCallingAI(true);
    setCallError("");
    try {
      const res = await fetch("/api/twenty2-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: callTarget.phone,
          candidate_name: callTarget.name,
          job_id: selectedJob,
          cv_result: callTarget.resultRef ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCallError(data.error ?? `Call failed (${res.status})`);
      } else {
        setCallTriggered(true);
      }
    } catch (err) {
      setCallError(`Network error: ${err}`);
    } finally {
      setCallingAI(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Twenty2 call modal */}
      {callModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setCallModalOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <p className="font-semibold text-gray-900">Schedule AI Voice Screen</p>
                <p className="text-xs text-gray-400 mt-0.5">Automated telephonic screening via Twenty2</p>
              </div>
              <button onClick={() => setCallModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Candidate name</label>
                <input type="text" value={callTarget.name} onChange={e => setCallTarget(t => ({ ...t, name: e.target.value }))} placeholder="Full name" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Phone number</label>
                <input type="tel" value={callTarget.phone} onChange={e => setCallTarget(t => ({ ...t, phone: e.target.value }))} placeholder="+91 XXXXXXXXXX" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400" />
              </div>
              {callTriggered ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <span className="text-green-700 text-sm font-medium">✓ AI screening call placed</span>
                  <button onClick={() => setCallModalOpen(false)} className="text-xs text-green-600 hover:underline">Close</button>
                </div>
              ) : (
                <>
                  {callError && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700 break-words">{callError}</div>}
                  <button onClick={triggerVoiceScreen} disabled={callingAI || !callTarget.phone.trim()} className="w-full py-2.5 text-white font-semibold rounded-xl disabled:opacity-40 hover:opacity-90 transition-all text-sm" style={{ background: OR }}>
                    {callingAI ? "Placing call…" : "Schedule AI Call →"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sourced candidates pending CV screening */}
      {sourcedQueue.length > 0 && (
        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-gray-900">From Source Profiles</h2>
              <p className="text-xs text-gray-400 mt-0.5">{sourcedQueue.length} candidate{sourcedQueue.length !== 1 ? "s" : ""} moved here — upload their CVs above to screen them</p>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {sourcedQueue.map(c => (
              <div key={c.id} className="flex items-center justify-between py-2.5 gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.full_name ?? "Unknown"}</p>
                  <p className="text-xs text-gray-400 truncate">{c.current_role ?? "—"}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.linkedin_url && (
                    <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors">
                      LinkedIn →
                    </a>
                  )}
                  <button
                    onClick={async () => {
                      await fetch(`/api/candidates?id=${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, status: "rejected" }) });
                      setSourcedQueue(prev => prev.filter(x => x.id !== c.id));
                    }}
                    className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500 transition-colors"
                    title="Remove from queue"
                  >×</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload panel */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="font-semibold">Screen CVs</h2>
          <button onClick={() => openCallModal()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl hover:opacity-90 transition-all" style={{ background: "rgba(124,58,237,0.08)", color: OR }}>
            📞 Telephonic screen
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">Upload one or more PDF / Word CVs. AI scores each against the selected JD simultaneously.</p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm font-medium block mb-1">Role</label>
            {jobList.length === 0 ? (
              <div className="border border-dashed border-gray-200 rounded-md px-4 py-4 flex flex-col items-start gap-2">
                <p className="text-xs text-gray-400">No saved JD yet.</p>
                <Link href="/employer/jd-builder" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all" style={{ background: OR }}>
                  + Create a JD
                </Link>
              </div>
            ) : (
              <div className="border rounded-md divide-y max-h-36 overflow-y-auto">
                {jobList.map(j => (
                  <div
                    key={j.id}
                    onClick={() => setSelectedJob(j.id)}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${selectedJob === j.id ? "bg-violet-50" : "hover:bg-gray-50"}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${selectedJob === j.id ? "bg-violet-500" : "bg-gray-200"}`} />
                      <span className="text-sm truncate">{j.title}</span>
                    </div>
                    <button
                      title="Delete this JD"
                      onClick={async e => {
                        e.stopPropagation();
                        if (!confirm(`Delete "${j.title}"? This cannot be undone.`)) return;
                        await fetch(`/api/jd?id=${j.id}`, { method: "DELETE" });
                        const next = jobList.filter(x => x.id !== j.id);
                        setJobList(next);
                        if (selectedJob === j.id) setSelectedJob(next[0]?.id ?? "");
                      }}
                      className="ml-2 w-6 h-6 flex items-center justify-center rounded border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors shrink-0 text-base leading-none"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">
              CV files
              {files.length > 0 && <span className="ml-2 text-xs text-violet-600 font-normal">{files.length} selected</span>}
            </label>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              multiple
              onChange={e => setFiles(Array.from(e.target.files ?? []))}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Select multiple files to screen in parallel</p>
          </div>
        </div>

        {loading && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Screening CVs…</span>
              <span>{progress.done}/{progress.total}</span>
            </div>
            <Progress value={(progress.done / Math.max(progress.total, 1)) * 100} className="h-1.5" />
          </div>
        )}

        {error && <p className="text-destructive text-sm mb-3">{error}</p>}

        <div className="flex gap-3">
          <Button onClick={screen} disabled={loading || !files.length || !selectedJob}>
            {loading ? `Analysing… (${progress.done}/${progress.total})` : `Screen ${files.length > 1 ? `${files.length} CVs` : "CV"}`}
          </Button>
          {results.length > 0 && (
            <Button variant="outline" onClick={() => { setResults([]); setFiles([]); setExpanded(null); setError(""); }}>
              Clear results
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">{results.length} candidate{results.length > 1 ? "s" : ""} screened</h3>
              <p className="text-xs text-gray-400 mt-0.5">Ranked by fit score · click a row to expand</p>
            </div>
            {results.length > 1 && (
              <button
                onClick={() => downloadReport(results)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                ⬇ Download all
              </button>
            )}
          </div>

          {/* Ranked list */}
          <div className="divide-y">
            {results.map((r, i) => (
              <div key={i}>
                <button
                  className="w-full text-left px-5 py-3.5 hover:bg-violet-50/30 transition-colors"
                  onClick={() => setExpanded(expanded === i ? null : i)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: OR }}>
                      {Math.min(Math.round(r.score), 100)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm">{r.name}</p>
                      <p className="text-xs text-gray-400 truncate">{r.current_role ?? r._fileName}</p>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${REC_BADGE[r.recommendation] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                      {r.recommendation}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); downloadReport([r]); }}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors shrink-0"
                      title="Download PDF report"
                    >⬇</button>
                    <span className="text-gray-300 text-sm">{expanded === i ? "▲" : "▼"}</span>
                  </div>
                </button>

                {expanded === i && (
                  <div className="px-5 pb-5 pt-2 border-t bg-gray-50/50 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-gray-500">{r.email}{r.phone ? ` · ${r.phone}` : ""}</p>
                        {r.current_role && <p className="text-sm text-gray-600 mt-0.5">{r.current_role}</p>}
                      </div>
                      <p className={`text-sm font-semibold ${REC_COLOR[r.recommendation] ?? ""}`}>{r.recommendation}</p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">AI Summary</p>
                      <p className="text-sm text-gray-700 bg-white rounded-lg p-3 border">{r.summary}</p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Score breakdown</p>
                      <div className="space-y-1.5">
                        {Object.entries(r.dimensions).map(([dim, score]) => (
                          <div key={dim} className="flex items-center gap-3">
                            <span className="text-xs text-gray-600 w-36">{{"skills_match":"Skills Match","experience_relevance":"Experience Relevance","impact_clarity":"Impact & Clarity","company_calibre":"Company Calibre","growth_trajectory":"Growth Trajectory","technical_depth":"Technical Depth","ai_fluency":"AI Fluency"}[dim] ?? dim.replace(/_/g," ")}</span>
                            <Progress value={score} className="flex-1 h-1.5" />
                            <span className="text-xs font-medium w-6 text-right">{score}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1.5">Strengths</p>
                        <ul className="space-y-1">
                          {r.strengths.map((s, j) => <li key={j} className="text-xs flex gap-1.5 text-gray-700"><span className="text-green-500 shrink-0">✓</span>{s}</li>)}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1.5">Gaps</p>
                        <ul className="space-y-1">
                          {r.gaps.map((g, j) => <li key={j} className="text-xs flex gap-1.5 text-gray-700"><span className="text-red-400 shrink-0">✗</span>{g}</li>)}
                        </ul>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => openCallModal({ name: r.name, phone: r.phone, resultRef: r })}
                        className="flex items-center gap-1.5 px-3 py-2 text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all"
                        style={{ background: OR }}
                      >
                        📞 AI Voice Screen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && results.length === 0 && files.length === 0 && (
        <div className="bg-white rounded-lg border p-8 text-center text-muted-foreground text-sm">
          Select CVs and click &quot;Screen CV&quot; to analyse candidates against the selected job description.
        </div>
      )}

      {/* Screening Test Generator */}
      {selectedJob && <ScreeningTestPanel jobId={selectedJob} jobTitle={jobList.find(j => j.id === selectedJob)?.title ?? ""} />}
    </div>
  );
}

function ScreeningTestPanel({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const [generating, setGenerating] = useState(false);
  const [test, setTest] = useState<{ id: string; title: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function generateTest() {
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-screening-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, job_title: jobTitle }),
      });
      const data = await res.json();
      if (data.assessment) setTest(data.assessment);
    } finally {
      setGenerating(false);
    }
  }

  function copyLink() {
    if (!test) return;
    navigator.clipboard.writeText(`${window.location.origin}/assessment/${test.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-white rounded-lg border p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">Screening Test</h3>
          <p className="text-xs text-gray-400 mt-0.5">AI-generated, JD-matched · 10 min · 6 questions · anti-cheat enabled</p>
        </div>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0" style={{ background: "rgba(124,58,237,0.1)" }}>📋</div>
      </div>
      {test ? (
        <div className="flex gap-2">
          <button onClick={copyLink}
            className="flex-1 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
            {copied ? "Copied ✓" : "Copy candidate link"}
          </button>
          <a href={`/assessment/${test.id}`} target="_blank" rel="noopener noreferrer"
            className="flex-1 py-2 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all text-center"
            style={{ background: OR }}>
            Preview test →
          </a>
        </div>
      ) : (
        <button onClick={generateTest} disabled={generating}
          className="w-full py-2.5 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:opacity-90 transition-all flex items-center justify-center gap-2"
          style={{ background: OR }}>
          {generating ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generating test…</> : "Generate screening test →"}
        </button>
      )}
    </div>
  );
}
