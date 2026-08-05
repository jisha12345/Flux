"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ClipboardPaste,
  Loader2,
  Sparkles,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const OR = "#F26522";
const OR_LIGHT = "rgba(242,101,34,0.08)";


const focus = {
  onFocus: (e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    e.currentTarget.style.borderColor = OR;
    e.currentTarget.style.boxShadow = `0 0 0 3px ${OR_LIGHT}`;
  },
  onBlur: (e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#e5e7eb";
    e.currentTarget.style.boxShadow = "none";
  },
};

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("# ")) {
      out.push(
        <h1 key={i} className="font-display text-2xl font-bold text-gray-900 mt-2 mb-3 tracking-tight">
          {renderInline(line.slice(2))}
        </h1>
      );
    } else if (line.startsWith("## ")) {
      out.push(
        <h2 key={i} className="font-display text-base font-semibold text-gray-900 mt-6 mb-2 pb-1.5 border-b border-gray-100 tracking-tight uppercase text-xs letter-spacing-wide" style={{ letterSpacing: "0.07em", fontSize: "11px", textTransform: "uppercase", color: OR }}>
          {renderInline(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      out.push(
        <h3 key={i} className="font-semibold text-gray-800 mt-4 mb-1.5 text-sm">
          {renderInline(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      const start = i;
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(lines[i].slice(2));
        i++;
      }
      out.push(
        <ul key={start} className="list-disc pl-5 my-1.5 space-y-1.5 marker:text-gray-400">
          {items.map((item, j) => (
            <li key={j} className="text-gray-700 text-[15px] leading-relaxed">{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    } else if (line.trim() === "") {
      out.push(<div key={i} className="h-3" />);
    } else {
      out.push(
        <p key={i} className="text-gray-700 text-[15px] leading-relaxed my-1">
          {renderInline(line)}
        </p>
      );
    }
    i++;
  }
  return out;
}

type TabId = "generate" | "upload" | "paste";

export default function JDBuilderPage() {
  const [tab, setTab] = useState<TabId>("generate");
  const [prompt, setPrompt] = useState("");
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [savedJobId, setSavedJobId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [assessment, setAssessment] = useState<{ id: string; title: string; questions: { text: string }[] } | null>(null);
  const [genAssessmentLoading, setGenAssessmentLoading] = useState(false);
  const [assessmentSaved, setAssessmentSaved] = useState(false);
  const [assessmentCopied, setAssessmentCopied] = useState(false);
  const [saveError, setSaveError] = useState("");
  const router = useRouter();

  function resetJDState() {
    setSaved(false);
    setSavedJobId(null);
    setAssessment(null);
    setAssessmentSaved(false);
    setEditMode(false);
    setGenerateError("");
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    resetJDState();
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload-jd", { method: "POST", body: form });
      const data = await res.json();
      if (data.text) setJd(data.text);
      else if (data.error) setGenerateError(data.error);
    } catch {
      setGenerateError("Failed to read file. Please try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function generateJD() {
    setLoading(true);
    setJd("");
    resetJDState();
    try {
      const res = await fetch("/api/generate-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const text = await res.text();
        setGenerateError(`Error ${res.status}: ${text || "Failed to generate JD"}`);
        setLoading(false);
        return;
      }
      if (!res.body) { setGenerateError("No response from server."); setLoading(false); return; }
      setLoading(false);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setJd(prev => prev + decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Unexpected error. Try again.");
      setLoading(false);
    }
  }

  async function saveJD() {
    setSaveError("");
    const title = jd.match(/^#\s+(.+)/m)?.[1]?.trim()
      || prompt?.split("\n")[0]?.replace(/[^a-zA-Z0-9 ]/g, "").trim().slice(0, 60)
      || "Job Description";
    try {
      const res = await fetch("/api/jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: jd, title }),
      });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.error ?? "Failed to save JD"); return; }
      setSavedJobId(data.job?.id ?? null);
      setSaved(true);
      router.refresh();
    } catch {
      setSaveError("Failed to save JD. Please try again.");
    }
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

  const tabs: { id: TabId; label: string; icon: LucideIcon }[] = [
    { id: "generate", label: "Generate with AI", icon: Sparkles },
    { id: "upload", label: "Upload JD", icon: Upload },
    { id: "paste", label: "Paste JD", icon: ClipboardPaste },
  ];

  return (
    <main className="min-h-screen" style={{ background: "#F2F3F7" }}>
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 px-8 py-0 flex items-center justify-between sticky top-0 z-20" style={{ height: 56 }}>
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm" style={{ background: OR }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" /></svg>
            </div>
            <span className="font-display font-bold text-gray-900 tracking-tight">Reqr</span>
            <span className="text-xs text-gray-400 font-medium">by Shiprocket</span>
          </Link>
          <span className="text-gray-200 font-light text-lg">/</span>
          <span className="text-sm font-medium text-gray-500">JD builder</span>
        </div>
        <Link
          href="/employer/dashboard"
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
        >
          <span>Dashboard</span>
        </Link>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-5">

        {/* Page heading */}
        <div className="mb-2">
          <h1 className="font-display text-3xl font-bold text-gray-900 tracking-tight">Job description</h1>
          <p className="text-gray-500 text-sm mt-1">Generate, upload, or paste a job description, then publish it and create a screening test.</p>
        </div>

        {/* Input card */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-100 px-6 pt-5">
            {tabs.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="relative mr-6 pb-3 text-sm font-medium transition-colors"
                  style={{ color: tab === t.id ? OR : "#9CA3AF" }}
                >
                  <span className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    {t.label}
                  </span>
                  {tab === t.id && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: OR }} />
                  )}
                </button>
              );
            })}
          </div>

          <div className="p-6">
            {/* Generate tab */}
            {tab === "generate" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Describe the role</label>
                  <Textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder="e.g. Product Manager for our logistics platform, 4+ years in ops-heavy products, will own shipment tracking and RTO reduction…"
                    className="min-h-[110px] border-gray-200 rounded-xl text-sm resize-none"
                    {...focus}
                  />
                </div>
                {generateError && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    <p className="text-sm text-red-600">{generateError}</p>
                  </div>
                )}
                <button
                  onClick={generateJD}
                  disabled={loading || !prompt.trim()}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-white font-semibold rounded-xl disabled:opacity-40 hover:opacity-90 transition-all text-sm shadow-sm"
                  style={{ background: loading ? "#f0956a" : OR }}
                >
                  {loading ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} aria-hidden="true" />Generating…</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />Generate JD</>
                  )}
                </button>
              </div>
            )}

            {/* Upload tab */}
            {tab === "upload" && (
              <div className="space-y-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Upload a file</label>
                <label
                  className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-200 rounded-xl py-12 cursor-pointer hover:border-orange-300 transition-colors"
                  style={{ background: uploading ? OR_LIGHT : "#FAFAFA" }}
                >
                  {uploading
                    ? <Loader2 className="h-5 w-5 text-gray-400 animate-spin" strokeWidth={1.75} aria-hidden="true" />
                    : <Upload className="h-5 w-5 text-gray-400" strokeWidth={1.75} aria-hidden="true" />}
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-700">{uploading ? "Uploading…" : "Click to upload"}</p>
                    <p className="text-xs text-gray-400 mt-0.5">PDF, Word (.doc/.docx), Excel (.xls/.xlsx), or .txt</p>
                  </div>
                  <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" onChange={handleUpload} disabled={uploading} />
                </label>
              </div>
            )}

            {/* Paste tab */}
            {tab === "paste" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Paste your JD</label>
                  <Textarea
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    placeholder="Paste your existing job description here…"
                    className="min-h-[220px] border-gray-200 rounded-xl text-sm resize-none"
                    autoFocus
                    {...focus}
                  />
                </div>
                <button
                  onClick={() => {
                    if (!pasteText.trim()) return;
                    setJd(pasteText.trim());
                    resetJDState();
                    setPasteText("");
                    setTab("generate");
                  }}
                  disabled={!pasteText.trim()}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-white font-semibold rounded-xl disabled:opacity-40 hover:opacity-90 transition-all text-sm shadow-sm"
                  style={{ background: OR }}
                >
                  Use this JD
                </button>
              </div>
            )}
          </div>
        </div>

        {/* JD preview */}
        {jd && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Preview header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900 font-display">Job description</span>
                {saved && (
                  <span className="ml-1 px-2 py-0.5 text-xs font-medium rounded-full" style={{ background: "rgba(34,197,94,0.1)", color: "#16a34a" }}>
                    Published
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {saved && (
                  <Link
                    href="/employer/dashboard?tab=screen"
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all"
                    style={{ background: "rgba(242,101,34,0.08)", color: OR }}
                  >
                    Screen CVs
                  </Link>
                )}
                <button
                  onClick={() => setEditMode(!editMode)}
                  className="px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-all"
                >
                  {editMode ? "Preview" : "Edit"}
                </button>
                <button
                  onClick={saveJD}
                  disabled={saved || !jd.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-lg transition-all disabled:opacity-50"
                  style={saved
                    ? { background: "rgba(34,197,94,0.1)", color: "#16a34a", border: "1px solid rgba(34,197,94,0.2)" }
                    : { background: OR, color: "#fff" }
                  }
                >
                  {saved
                    ? <><Check className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />Published</>
                    : "Publish JD"}
                </button>
              </div>
            </div>

            {saveError && (
              <div className="mx-6 mt-4 flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm text-red-600">{saveError}</p>
              </div>
            )}
            {editMode ? (
              <div className="p-6">
                <Textarea
                  value={jd}
                  onChange={e => { setJd(e.target.value); setSaved(false); }}
                  className="min-h-[500px] text-sm border-gray-200 rounded-xl resize-none"
                  style={{ fontFamily: "var(--font-inter)", lineHeight: "1.75" }}
                />
              </div>
            ) : (
              <div className="px-10 py-8" style={{ fontFamily: "var(--font-inter)" }}>
                {renderMarkdown(jd)}
              </div>
            )}
          </div>
        )}

        {/* Screening assessment */}
        {jd && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900 font-display">Screening assessment</p>
                <p className="text-xs text-gray-400 mt-0.5">Generate a 5-question test tied to this JD</p>
              </div>
              {!assessmentSaved && (
                <button
                  onClick={async () => { if (!saved) await saveJD(); await generateAssessment(); }}
                  disabled={genAssessmentLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 text-white font-semibold rounded-lg text-sm disabled:opacity-40 hover:opacity-90 transition-all shadow-sm"
                  style={{ background: OR }}
                >
                  {genAssessmentLoading ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} aria-hidden="true" />Generating…</>
                  ) : "Generate test"}
                </button>
              )}
            </div>

            {assessment ? (
              <div className="px-6 py-5 space-y-4">
                <p className="text-sm font-semibold text-gray-800">{assessment.title}</p>
                <div className="space-y-3">
                  {assessment.questions.map((q, i) => (
                    <div key={i} className="flex gap-4 items-start">
                      <span
                        className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold"
                        style={{ background: OR_LIGHT, color: OR }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-sm text-gray-700 leading-relaxed">{q.text}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/assessment/${assessment.id}`);
                      setAssessmentCopied(true);
                      setTimeout(() => setAssessmentCopied(false), 2000);
                    }}
                    className="flex items-center gap-1.5 px-4 py-1.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {assessmentCopied
                      ? <><Check className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />Copied</>
                      : "Copy candidate link"}
                  </button>
                  <Link
                    href={`/assessment/${assessment.id}`}
                    target="_blank"
                    className="flex items-center gap-1.5 px-4 py-1.5 text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-all"
                    style={{ background: OR }}
                  >
                    Preview
                  </Link>
                </div>
              </div>
            ) : (
              <div className="px-6 py-8 text-center">
                <p className="text-sm text-gray-400">No assessment generated yet.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
