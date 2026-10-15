"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ClipboardList, ClipboardPaste, Loader2, Upload } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const SHIPROCKET_ORANGE = "#F26522";

interface Job {
  id: string;
  title: string;
  description?: string;
  is_active: boolean;
}

export default function TestsTab({ jobs }: { jobs: Job[] }) {
  const router = useRouter();
  const [generating, setGenerating] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, { id: string; title: string }>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [jdMode, setJdMode] = useState<null | "paste" | "upload">(null);
  const [jdText, setJdText] = useState("");
  const [jdTitle, setJdTitle] = useState("");
  const [jdSaving, setJdSaving] = useState(false);
  const [jdUploading, setJdUploading] = useState(false);

  async function handleJDUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setJdUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload-jd", { method: "POST", body: form });
    const data = await res.json();
    if (data.text) {
      setJdText(data.text);
      const firstLine = data.text.split("\n").find((l: string) => l.trim());
      setJdTitle(firstLine?.replace(/^[#\-*\s]+/, "").slice(0, 80) ?? "");
      setJdMode("paste");
    }
    setJdUploading(false);
    e.target.value = "";
  }

  async function saveJD() {
    if (!jdText.trim()) return;
    setJdSaving(true);
    try {
      const title = jdTitle.trim() || "Job Description";
      await fetch("/api/jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: jdText.trim(), title }),
      });
      setJdMode(null);
      setJdText("");
      setJdTitle("");
      router.refresh();
    } finally {
      setJdSaving(false);
    }
  }

  async function generateTest(job: Job) {
    setGenerating(job.id);
    try {
      const res = await fetch("/api/generate-screening-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: job.id,
          job_description: job.description ?? job.title,
          job_title: job.title,
        }),
      });
      const data = await res.json();
      if (data.assessment) setTests(prev => ({ ...prev, [job.id]: data.assessment }));
    } finally {
      setGenerating(null);
    }
  }

  function copyLink(assessmentId: string) {
    const url = `${window.location.origin}/assessment/${assessmentId}`;
    navigator.clipboard.writeText(url);
    setCopied(assessmentId);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border shadow-sm p-5 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 mb-1">Screening tests</h3>
          <p className="text-sm text-gray-400">Generate a JD-matched, 10-minute timed test per role. Share the link with candidates.</p>
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(242,101,34,0.1)" }}>
          <ClipboardList className="h-5 w-5" strokeWidth={1.75} style={{ color: SHIPROCKET_ORANGE }} aria-hidden="true" />
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm p-8">
          <p className="text-gray-400 text-sm text-center mb-5">No job description yet. Add one to get started.</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/employer/jd-builder" className="px-4 py-2 text-white text-sm font-semibold rounded-xl" style={{ background: SHIPROCKET_ORANGE }}>
              Generate with AI
            </Link>
            <label className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-xl hover:border-gray-300 hover:bg-gray-50 text-sm cursor-pointer">
              {jdUploading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} aria-hidden="true" />
                : <Upload className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />}
              <span>{jdUploading ? "Uploading…" : "Upload JD"}</span>
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" onChange={handleJDUpload} disabled={jdUploading} />
            </label>
            <button
              onClick={() => setJdMode(jdMode === "paste" ? null : "paste")}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-xl hover:border-gray-300 hover:bg-gray-50 text-sm"
            >
              <ClipboardPaste className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              <span>Paste JD</span>
            </button>
          </div>

          {jdMode === "paste" && (
            <div className="mt-5 space-y-3">
              <input
                type="text"
                value={jdTitle}
                onChange={e => setJdTitle(e.target.value)}
                placeholder="Job title (e.g. Senior Backend Engineer)"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              />
              <Textarea
                value={jdText}
                onChange={e => setJdText(e.target.value)}
                placeholder="Paste your job description here…"
                className="min-h-[180px] border-gray-200 rounded-xl text-sm"
                autoFocus
              />
              <button
                onClick={saveJD}
                disabled={jdSaving || !jdText.trim()}
                className="px-5 py-2 text-white font-semibold rounded-xl disabled:opacity-40 hover:opacity-90 transition-all text-sm"
                style={{ background: SHIPROCKET_ORANGE }}
              >
                {jdSaving ? "Saving…" : "Save JD"}
              </button>
            </div>
          )}
        </div>
      ) : (
        jobs.map(job => {
          const test = tests[job.id];
          return (
            <div key={job.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="p-5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{job.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full border text-xs mr-2 ${job.is_active ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                      {job.is_active ? "Active" : "Inactive"}
                    </span>
                    10 min · 6 questions · anti-cheat enabled
                  </p>
                  {test && (
                    <p className="flex items-center gap-1.5 text-xs text-green-600 mt-1.5 font-medium">
                      <Check className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      Test generated, ready to share
                    </p>
                  )}
                </div>
              </div>
              <div className="px-5 pb-5">
                {test ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyLink(test.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      {copied === test.id
                        ? <><Check className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />Copied</>
                        : "Copy candidate link"}
                    </button>
                    <Link
                      href={`/assessment/${test.id}`}
                      target="_blank"
                      className="flex-1 py-2 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all text-center"
                      style={{ background: SHIPROCKET_ORANGE }}
                    >
                      Preview test
                    </Link>
                  </div>
                ) : (
                  <button
                    onClick={() => generateTest(job)}
                    disabled={generating === job.id}
                    className="w-full py-2.5 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:opacity-90 transition-all flex items-center justify-center gap-2"
                    style={{ background: SHIPROCKET_ORANGE }}
                  >
                    {generating === job.id ? (
                      <><Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden="true" />Generating test…</>
                    ) : (
                      "Generate screening test"
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
