"use client";

import { useState } from "react";
import Link from "next/link";
import { JobDescription } from "@/lib/types";

export default function JDBuilder() {
  const [brief, setBrief] = useState("");
  const [jd, setJd] = useState<JobDescription | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function generateJD() {
    if (!brief.trim()) return;
    setLoading(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/generate-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setJd(data.jd);
    } catch {
      setError("Generation failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function updateJd(field: keyof JobDescription, value: string | string[]) {
    setJd((prev) => prev ? { ...prev, [field]: value } : null);
  }

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Sidebar */}
      <div className="w-64 border-r border-zinc-900 p-6 flex flex-col gap-6 shrink-0">
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-widest mb-1">Recruiter Portal</p>
          <p className="text-white font-semibold">JD Builder</p>
        </div>
        <nav className="space-y-1">
          {[
            { label: "Candidates", href: "/employer/dashboard", active: false },
            { label: "JD Builder", href: "/employer/jd-builder", active: true },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                item.active ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-white hover:bg-zinc-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Main */}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-8">
          <div>
            <h1 className="text-2xl font-bold">AI Job Description Builder</h1>
            <p className="text-zinc-500 text-sm mt-1">Describe the role in plain English. Claude will write the JD.</p>
          </div>

          <div className="space-y-3">
            <textarea
              rows={4}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="e.g. We need a senior product manager for our growth team. They'll own our seller acquisition funnel, work closely with engineering and data, and need to be comfortable using AI to speed up their work. 5-8 years exp, Bengaluru preferred, hybrid."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 outline-none focus:border-zinc-600 resize-none transition-colors"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={generateJD}
              disabled={loading || !brief.trim()}
              className="px-6 py-2.5 bg-white text-black font-medium rounded-full disabled:opacity-30 hover:bg-zinc-100 transition-all text-sm"
            >
              {loading ? "Generating..." : "Generate JD with AI →"}
            </button>
          </div>

          {jd && (
            <div className="space-y-6 border border-zinc-800 rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <p className="text-zinc-400 text-sm">Edit and save your JD</p>
                {saved && <p className="text-green-400 text-sm">Saved!</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {(["title", "department", "location", "type", "experience_range", "ctc_range"] as const).map((field) => (
                  <div key={field} className="space-y-1">
                    <label className="text-zinc-500 text-xs uppercase tracking-wider">
                      {field.replace(/_/g, " ")}
                    </label>
                    <input
                      type="text"
                      value={jd[field] as string}
                      onChange={(e) => updateJd(field, e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-zinc-600"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <label className="text-zinc-500 text-xs uppercase tracking-wider">About the role</label>
                <textarea
                  rows={3}
                  value={jd.about_role}
                  onChange={(e) => updateJd("about_role", e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-zinc-600 resize-none"
                />
              </div>

              {(["responsibilities", "requirements", "nice_to_have"] as const).map((field) => (
                <div key={field} className="space-y-2">
                  <label className="text-zinc-500 text-xs uppercase tracking-wider">{field.replace(/_/g, " ")}</label>
                  {(jd[field] as string[]).map((item, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        value={item}
                        onChange={(e) => {
                          const updated = [...(jd[field] as string[])];
                          updated[i] = e.target.value;
                          updateJd(field, updated);
                        }}
                        className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-zinc-600"
                      />
                      <button
                        onClick={() => {
                          const updated = (jd[field] as string[]).filter((_, idx) => idx !== i);
                          updateJd(field, updated);
                        }}
                        className="text-zinc-600 hover:text-red-400 px-2 transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => updateJd(field, [...(jd[field] as string[]), ""])}
                    className="text-zinc-600 text-sm hover:text-zinc-400 transition-colors"
                  >
                    + Add item
                  </button>
                </div>
              ))}

              <div className="space-y-1">
                <label className="text-zinc-500 text-xs uppercase tracking-wider">AI expectations</label>
                <textarea
                  rows={2}
                  value={jd.ai_expectations}
                  onChange={(e) => updateJd("ai_expectations", e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-zinc-600 resize-none"
                />
              </div>

              <button
                onClick={() => setSaved(true)}
                className="px-6 py-2.5 bg-white text-black font-medium rounded-full hover:bg-zinc-100 transition-all text-sm"
              >
                Save JD
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
