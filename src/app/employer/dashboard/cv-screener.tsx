"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Phone, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const OR = "#F26522";

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
}

interface CallTarget {
  name: string;
  phone: string;
  fromCVResult?: boolean;
}

export default function CVScreener({ jobs }: { jobs: Job[] }) {
  const [selectedJob, setSelectedJob] = useState(jobs[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ScreenResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Twenty2 modal
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [callTarget, setCallTarget] = useState<CallTarget>({ name: "", phone: "" });
  const [callingAI, setCallingAI] = useState(false);
  const [callTriggered, setCallTriggered] = useState(false);

  function openCallModal(prefill?: Partial<CallTarget>) {
    setCallTarget({ name: prefill?.name ?? "", phone: prefill?.phone ?? "" });
    setCallTriggered(false);
    setCallModalOpen(true);
  }

  async function screen() {
    if (!file || !selectedJob) return;
    setLoading(true);
    setError("");
    setResult(null);
    setCallTriggered(false);

    const form = new FormData();
    form.append("cv", file);
    form.append("job_id", selectedJob);

    const res = await fetch("/api/screen-cv", { method: "POST", body: form });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Screening failed");
    } else {
      setResult(data.result);
    }
    setLoading(false);
  }

  async function triggerVoiceScreen() {
    if (!callTarget.phone.trim()) return;
    setCallingAI(true);
    try {
      await fetch("/api/twenty2-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: callTarget.phone,
          candidate_name: callTarget.name,
          job_id: selectedJob,
          cv_result: callTarget.fromCVResult ? result : undefined,
        }),
      });
      setCallTriggered(true);
    } finally {
      setCallingAI(false);
    }
  }

  function resetForm() {
    setResult(null);
    setFile(null);
    setCallTriggered(false);
  }

  const recommendationColor: Record<string, string> = {
    "Strong yes": "text-green-600",
    "Yes": "text-blue-600",
    "Maybe": "text-yellow-600",
    "No": "text-red-600",
  };

  return (
    <div className="space-y-6">
      {/* Twenty2 call modal */}
      {callModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setCallModalOpen(false); }}
        >
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <p className="font-semibold text-gray-900">Schedule AI voice screen</p>
                <p className="text-xs text-gray-400 mt-0.5">Automated telephonic screening via Twenty2</p>
              </div>
              <button
                onClick={() => setCallModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Candidate name</label>
                <input
                  type="text"
                  value={callTarget.name}
                  onChange={e => setCallTarget(t => ({ ...t, name: e.target.value }))}
                  placeholder="Full name"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Phone number</label>
                <input
                  type="tel"
                  value={callTarget.phone}
                  onChange={e => setCallTarget(t => ({ ...t, phone: e.target.value }))}
                  placeholder="+91 XXXXXXXXXX"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>
              {callTriggered ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <span className="text-green-700 text-sm font-medium">AI screening call scheduled</span>
                  <button onClick={() => setCallModalOpen(false)} className="text-xs text-green-600 hover:underline">Close</button>
                </div>
              ) : (
                <button
                  onClick={triggerVoiceScreen}
                  disabled={callingAI || !callTarget.phone.trim()}
                  className="w-full py-2.5 text-white font-semibold rounded-xl disabled:opacity-40 hover:opacity-90 transition-all text-sm"
                  style={{ background: OR }}
                >
                  {callingAI ? "Scheduling…" : "Schedule AI call"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="font-semibold">Screen a CV</h2>
          <button
            onClick={() => openCallModal()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl hover:opacity-90 transition-all"
            style={{ background: "rgba(242,101,34,0.08)", color: OR }}
          >
            <Phone className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Telephonic screen
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-6">Upload a PDF or Word document. AI will parse and score it against the selected job description.</p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm font-medium block mb-1">Job description</label>
            {jobs.length === 0 ? (
              <div className="border border-dashed border-gray-200 rounded-md px-4 py-4 flex flex-col items-start gap-2">
                <p className="text-xs text-gray-400">No saved JD yet.</p>
                <Link
                  href="/employer/jd-builder"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all"
                  style={{ background: OR }}
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  Create a JD
                </Link>
              </div>
            ) : (
              <select
                value={selectedJob}
                onChange={e => setSelectedJob(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>{j.title}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">CV file</label>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>

        {error && <p className="text-destructive text-sm mb-3">{error}</p>}

        <Button onClick={screen} disabled={loading || !file || !selectedJob}>
          {loading ? "Analysing CV…" : "Screen CV"}
        </Button>
      </div>

      {result && (
        <div className="bg-white rounded-lg border p-6 space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xl font-bold">{result.name}</h3>
              <p className="text-sm text-muted-foreground">{result.email}{result.phone ? ` · ${result.phone}` : ""}</p>
              {result.current_role && <p className="text-sm mt-0.5">{result.current_role}</p>}
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{result.score}<span className="text-lg text-muted-foreground">/100</span></p>
              <p className={`text-sm font-semibold mt-1 ${recommendationColor[result.recommendation] ?? ""}`}>
                {result.recommendation}
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">AI summary</p>
            <p className="text-sm text-muted-foreground bg-gray-50 rounded-lg p-4">{result.summary}</p>
          </div>

          <div>
            <p className="text-sm font-medium mb-3">Score breakdown</p>
            <div className="space-y-2">
              {Object.entries(result.dimensions).map(([dim, score]) => (
                <div key={dim} className="flex items-center gap-3">
                  <span className="text-sm w-36 capitalize">{dim.replace(/_/g, " ")}</span>
                  <Progress value={score} className="flex-1 h-2" />
                  <span className="text-sm font-medium w-8 text-right">{score}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium mb-2 text-green-600">Strengths</p>
              <ul className="space-y-1">
                {result.strengths.map((s, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <Check className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium mb-2 text-red-500">Gaps</p>
              <ul className="space-y-1">
                {result.gaps.map((g, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <X className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2 border-t">
            {callTriggered ? (
              <Badge variant="default" className="bg-green-600">AI call scheduled</Badge>
            ) : (
              <button
                onClick={() => openCallModal({ name: result.name, phone: result.phone, fromCVResult: true })}
                className="flex items-center gap-2 px-4 py-2 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all shadow-sm"
                style={{ background: OR }}
              >
                <Phone className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Schedule AI voice screen
              </button>
            )}
            <Button
              variant="outline"
              onClick={resetForm}
            >
              Screen another CV
            </Button>
            <button
              onClick={() => openCallModal()}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-all"
            >
              <Phone className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
              New telephonic screen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
