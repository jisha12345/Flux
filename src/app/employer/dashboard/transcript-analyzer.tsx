"use client";

import { useState } from "react";

const SHIPROCKET_ORANGE = "#F26522";

interface Analysis {
  overall_score: number;
  recommendation: string;
  summary: string;
  technical_assessment: { score: number; strengths: string[]; gaps: string[]; notes: string };
  communication: { score: number; notes: string };
  culture_fit: { score: number; notes: string };
  key_moments: { quote: string; significance: string }[];
  red_flags: string[];
  next_steps: string;
}

interface Props {
  interviewId?: string;
  candidateName?: string;
  role?: string;
  onClose: () => void;
}

const RECOMMENDATION_COLOR: Record<string, string> = {
  "Strong Hire": "bg-green-100 text-green-800 border-green-200",
  "Hire": "bg-blue-100 text-blue-800 border-blue-200",
  "Maybe": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "No Hire": "bg-red-100 text-red-800 border-red-200",
};

function ScoreBar({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-600">
        <span>{label}</span>
        <span className="font-semibold">{score}/100</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

export default function TranscriptAnalyzer({ interviewId, candidateName, role, onClose }: Props) {
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  async function analyzeTranscript() {
    if (!transcript.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/interviews/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interview_id: interviewId, transcript, candidate_name: candidateName, role }),
      });
      const data = await res.json();
      setAnalysis(data.analysis);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex">
      <div className="flex-1" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto flex flex-col shadow-2xl">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-gray-900">Interview Analysis</h2>
            {candidateName && <p className="text-sm text-gray-500">{candidateName}{role ? ` — ${role}` : ""}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full text-xl">×</button>
        </div>

        <div className="flex-1 p-6 space-y-5">
          {!analysis ? (
            <>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 space-y-2">
                <p className="font-semibold">Paste your interview transcript</p>
                <p className="text-xs">Works with any transcript source:</p>
                <ul className="text-xs space-y-0.5 opacity-80">
                  <li>· <strong>Google Meet:</strong> After the call → Activities → Transcripts → View</li>
                  <li>· <strong>Granola:</strong> Open note after meeting → Copy transcript</li>
                  <li>· <strong>Zoom / Otter.ai:</strong> Export transcript → paste below</li>
                  <li>· <strong>Recording to transcript:</strong> Upload the recording to Otter.ai or Fireflies.ai, then paste the output</li>
                </ul>
                <p className="text-xs opacity-60 pt-1">To enable auto-recording on Google Meet: Ask your Workspace admin to enable recording, or use Granola (free) which records and transcribes automatically.</p>
              </div>
              <textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder="Paste the full interview transcript here…

[Interviewer]: Tell me about a system you built at scale.
[Candidate]: Sure, at my previous company I built…"
                rows={16}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none resize-none leading-relaxed"
                onFocus={e => { e.currentTarget.style.borderColor = SHIPROCKET_ORANGE; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(242,101,34,0.1)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
              />
              <button
                onClick={analyzeTranscript}
                disabled={loading || transcript.trim().length < 100}
                className="w-full py-3 text-white font-semibold rounded-xl text-sm disabled:opacity-40 hover:opacity-90 transition-all"
                style={{ background: SHIPROCKET_ORANGE }}
              >
                {loading ? "Analysing transcript…" : "Generate AI Analysis →"}
              </button>
            </>
          ) : (
            <div className="space-y-5">
              {/* Header */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold" style={{ background: SHIPROCKET_ORANGE }}>
                  {analysis.overall_score}
                </div>
                <div>
                  <span className={`text-sm font-bold px-3 py-1 rounded-full border ${RECOMMENDATION_COLOR[analysis.recommendation] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                    {analysis.recommendation}
                  </span>
                  <p className="text-xs text-gray-500 mt-1">Overall score: {analysis.overall_score}/100</p>
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-xl border border-gray-200 p-4" style={{ background: "#F4F5F7" }}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Summary</p>
                <p className="text-sm text-gray-800 leading-relaxed">{analysis.summary}</p>
              </div>

              {/* Scores */}
              <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Scores</p>
                <ScoreBar score={analysis.technical_assessment?.score ?? 0} label="Technical depth" />
                <ScoreBar score={analysis.communication?.score ?? 0} label="Communication" />
                <ScoreBar score={analysis.culture_fit?.score ?? 0} label="Culture fit" />
              </div>

              {/* Technical */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                  <p className="text-xs font-bold text-green-700 mb-2">✓ Technical Strengths</p>
                  <ul className="space-y-1">
                    {analysis.technical_assessment?.strengths?.map((s, i) => (
                      <li key={i} className="text-sm text-green-800 flex gap-2"><span>·</span>{s}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                  <p className="text-xs font-bold text-red-700 mb-2">✗ Gaps</p>
                  <ul className="space-y-1">
                    {analysis.technical_assessment?.gaps?.map((g, i) => (
                      <li key={i} className="text-sm text-red-800 flex gap-2"><span>·</span>{g}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Key moments */}
              {analysis.key_moments?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Key Moments</p>
                  {analysis.key_moments.map((m, i) => (
                    <div key={i} className="rounded-xl border border-gray-200 p-3">
                      <p className="text-sm text-gray-700 italic">&ldquo;{m.quote}&rdquo;</p>
                      <p className="text-xs text-gray-500 mt-1">{m.significance}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Red flags */}
              {analysis.red_flags?.length > 0 && analysis.red_flags[0] && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-xs font-bold text-red-700 mb-2">🚩 Red Flags</p>
                  <ul className="space-y-1">
                    {analysis.red_flags.map((f, i) => (
                      <li key={i} className="text-sm text-red-800">{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Next steps */}
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs font-bold text-blue-700 mb-2">→ Next Steps</p>
                <p className="text-sm text-blue-800">{analysis.next_steps}</p>
              </div>

              <button
                onClick={() => setAnalysis(null)}
                className="w-full py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50"
              >
                ← Analyse another transcript
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
