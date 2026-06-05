"use client";

import { useState } from "react";
import Link from "next/link";

const SHIPROCKET_ORANGE = "#F26522";

interface Job {
  id: string;
  title: string;
  description?: string;
  is_active: boolean;
}

export default function TestsTab({ jobs }: { jobs: Job[] }) {
  const [generating, setGenerating] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, { id: string; title: string }>>({});
  const [copied, setCopied] = useState<string | null>(null);

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
          <h3 className="font-semibold text-gray-900 mb-1">Screening Tests</h3>
          <p className="text-sm text-gray-400">Generate a JD-matched, 10-minute timed test per role. Share the link with candidates.</p>
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: "rgba(242,101,34,0.1)" }}>📋</div>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm p-10 text-center">
          <p className="text-gray-400 text-sm">Create a JD first to generate a screening test.</p>
          <Link href="/employer/jd-builder" className="inline-block mt-3 px-4 py-2 text-white text-sm font-semibold rounded-xl" style={{ background: SHIPROCKET_ORANGE }}>
            + New JD
          </Link>
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
                  {test && <p className="text-xs text-green-600 mt-1.5 font-medium">✓ Test generated — ready to share</p>}
                </div>
              </div>
              <div className="px-5 pb-5">
                {test ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyLink(test.id)}
                      className="flex-1 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      {copied === test.id ? "Copied ✓" : "Copy candidate link"}
                    </button>
                    <Link
                      href={`/assessment/${test.id}`}
                      target="_blank"
                      className="flex-1 py-2 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all text-center"
                      style={{ background: SHIPROCKET_ORANGE }}
                    >
                      Preview test →
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
                      <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generating test…</>
                    ) : (
                      "Generate screening test →"
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
