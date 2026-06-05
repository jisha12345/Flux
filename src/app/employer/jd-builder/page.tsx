"use client";

import { useState } from "react";
import Link from "next/link";
import { Textarea } from "@/components/ui/textarea";

const SHIPROCKET_ORANGE = "#F26522";

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" />
  </svg>
);

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("## ")) {
      return <h2 key={i} className="text-lg font-bold text-gray-900 mt-6 mb-2">{line.slice(3)}</h2>;
    }
    if (line.startsWith("# ")) {
      return <h1 key={i} className="text-xl font-bold text-gray-900 mt-4 mb-2">{line.slice(2)}</h1>;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return (
        <div key={i} className="flex gap-2 my-1">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: SHIPROCKET_ORANGE }} />
          <span className="text-gray-700">{line.slice(2)}</span>
        </div>
      );
    }
    if (line.trim() === "") return <div key={i} className="h-2" />;
    return <p key={i} className="text-gray-700 my-1 leading-relaxed">{line}</p>;
  });
}

export default function JDBuilderPage() {
  const [prompt, setPrompt] = useState("");
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [savedJobId, setSavedJobId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [assessment, setAssessment] = useState<{ id: string; title: string; questions: { text: string }[] } | null>(null);
  const [genAssessmentLoading, setGenAssessmentLoading] = useState(false);
  const [assessmentSaved, setAssessmentSaved] = useState(false);

  async function generateJD() {
    setLoading(true);
    setJd("");
    setSaved(false);
    setSavedJobId(null);
    setAssessment(null);
    setAssessmentSaved(false);
    setEditMode(false);

    const res = await fetch("/api/generate-jd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!res.body) { setLoading(false); return; }
    setLoading(false);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      setJd(prev => prev + decoder.decode(value, { stream: true }));
    }
  }

  async function saveJD() {
    const res = await fetch("/api/jd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: jd, prompt }),
    });
    const data = await res.json();
    setSavedJobId(data.job?.id ?? null);
    setSaved(true);
  }

  async function generateAssessment() {
    setGenAssessmentLoading(true);
    const res = await fetch("/api/generate-assessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: savedJobId, job_description: jd }),
    });
    const data = await res.json();
    setAssessment(data.assessment ?? null);
    setAssessmentSaved(true);
    setGenAssessmentLoading(false);
  }

  return (
    <main className="min-h-screen" style={{ background: "#F4F5F7" }}>
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: SHIPROCKET_ORANGE }}>
              <ShieldIcon className="w-4 h-4 fill-white" />
            </div>
            <span className="font-bold text-gray-900">Reqr</span>
            <span className="text-xs text-gray-400">by Shiprocket</span>
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-500">JD Builder</span>
        </div>
        <Link href="/employer/dashboard" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">← Dashboard</Link>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Generate a job description</h1>
          <p className="text-gray-400 text-sm">Describe the role in plain English.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <label className="text-sm font-medium text-gray-700 block mb-2">Describe the role</label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Senior backend engineer for our payments infra team, 4+ years Go or Rust, will own our settlement pipeline…"
            className="min-h-[100px] mb-4 border-gray-200 rounded-xl"
            onFocus={(e) => { e.currentTarget.style.borderColor = SHIPROCKET_ORANGE; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(242,101,34,0.1)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
          />
          <button
            onClick={generateJD}
            disabled={loading || !prompt.trim()}
            className="px-6 py-2.5 text-white font-semibold rounded-xl disabled:opacity-40 hover:opacity-90 transition-all text-sm"
            style={{ background: SHIPROCKET_ORANGE }}
          >
            {loading ? "Starting…" : "Generate JD"}
          </button>
        </div>

        {jd && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Generated JD</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditMode(!editMode)}
                  className="px-3 py-1.5 text-xs border border-gray-200 text-gray-600 font-medium rounded-lg hover:border-gray-300 transition-all"
                >
                  {editMode ? "Preview" : "Edit"}
                </button>
                <button
                  onClick={saveJD}
                  disabled={saved}
                  className="px-4 py-2 border border-gray-200 text-gray-700 font-medium rounded-xl text-sm hover:border-gray-300 transition-all disabled:opacity-50"
                >
                  {saved ? "Saved ✓" : "Save & publish"}
                </button>
              </div>
            </div>

            {editMode ? (
              <Textarea
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                className="min-h-[400px] text-sm border-gray-200 rounded-xl"
                style={{ fontFamily: "Inter, sans-serif", lineHeight: "1.7", fontSize: "14px" }}
              />
            ) : (
              <div
                className="rounded-xl border border-gray-100 p-5"
                style={{ fontFamily: "Inter, sans-serif", fontSize: "15px", lineHeight: "1.75", background: "#fafafa" }}
              >
                {renderMarkdown(jd)}
              </div>
            )}
          </div>
        )}

        {jd && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-gray-900">Screening assessment</h2>
              {!assessmentSaved && (
                <button
                  onClick={async () => {
                    if (!saved) await saveJD();
                    await generateAssessment();
                  }}
                  disabled={genAssessmentLoading}
                  className="px-4 py-2 text-white font-semibold rounded-xl text-sm disabled:opacity-40 hover:opacity-90 transition-all"
                  style={{ background: SHIPROCKET_ORANGE }}
                >
                  {genAssessmentLoading ? "Generating test…" : "Generate screening test"}
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-4">Auto-generates a 5-question technical assessment tied to this JD.</p>

            {assessment && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">{assessment.title}</p>
                <ol className="space-y-2">
                  {assessment.questions.map((q, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-xs font-bold text-gray-400 mt-0.5 shrink-0">Q{i + 1}</span>
                      <span className="text-sm text-gray-700">{q.text}</span>
                    </li>
                  ))}
                </ol>
                {savedJobId && (
                  <div className="pt-2">
                    <Link
                      href={`/assessment/${assessment.id}`}
                      className="text-xs font-medium underline"
                      style={{ color: SHIPROCKET_ORANGE }}
                    >
                      Preview candidate assessment →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
