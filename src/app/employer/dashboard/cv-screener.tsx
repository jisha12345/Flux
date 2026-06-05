"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

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
  twentyTwoCallTriggered?: boolean;
}

export default function CVScreener({ jobs }: { jobs: Job[] }) {
  const [selectedJob, setSelectedJob] = useState(jobs[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ScreenResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [callingAI, setCallingAI] = useState(false);
  const [callTriggered, setCallTriggered] = useState(false);

  async function screen() {
    if (!file || !selectedJob) return;
    setLoading(true);
    setError("");
    setResult(null);

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
    if (!result?.phone) return;
    setCallingAI(true);
    await fetch("/api/twenty2-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: result.phone, candidate_name: result.name, job_id: selectedJob }),
    });
    setCallTriggered(true);
    setCallingAI(false);
  }

  const recommendationColor = {
    "Strong yes": "text-green-600",
    "Yes": "text-blue-600",
    "Maybe": "text-yellow-600",
    "No": "text-red-600",
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border p-6">
        <h2 className="font-semibold mb-4">Screen a CV</h2>
        <p className="text-sm text-muted-foreground mb-6">Upload a PDF or Word document. AI will parse and score it against the selected job description.</p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm font-medium block mb-1">Job description</label>
            <select
              value={selectedJob}
              onChange={e => setSelectedJob(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
              {jobs.length === 0 && <option value="">No jobs — create one first</option>}
            </select>
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
              <p className={`text-sm font-semibold mt-1 ${recommendationColor[result.recommendation]}`}>
                {result.recommendation}
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">AI Summary</p>
            <p className="text-sm text-muted-foreground bg-gray-50 rounded-lg p-4">{result.summary}</p>
          </div>

          <div>
            <p className="text-sm font-medium mb-3">Score breakdown</p>
            <div className="space-y-2">
              {Object.entries(result.dimensions).map(([dim, score]) => (
                <div key={dim} className="flex items-center gap-3">
                  <span className="text-sm w-32 capitalize">{dim.replace(/_/g, " ")}</span>
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
                {result.strengths.map((s, i) => <li key={i} className="text-sm flex gap-2"><span className="text-green-500">✓</span>{s}</li>)}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium mb-2 text-red-500">Gaps</p>
              <ul className="space-y-1">
                {result.gaps.map((g, i) => <li key={i} className="text-sm flex gap-2"><span className="text-red-400">✗</span>{g}</li>)}
              </ul>
            </div>
          </div>

          <div className="flex gap-3 pt-2 border-t">
            {result.phone && !callTriggered && (
              <Button variant="outline" onClick={triggerVoiceScreen} disabled={callingAI}>
                {callingAI ? "Scheduling call…" : "AI Voice Screen (Twenty2)"}
              </Button>
            )}
            {callTriggered && (
              <Badge variant="default" className="bg-green-600">AI call scheduled ✓</Badge>
            )}
            <Button variant="outline" onClick={() => { setResult(null); setFile(null); }}>
              Screen another
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
