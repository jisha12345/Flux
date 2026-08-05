"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Mic } from "lucide-react";

const SHIPROCKET_ORANGE = "#F26522";

interface Candidate {
  id: string;
  full_name?: string;
  name?: string;
  email: string;
  current_role?: string;
  current_company?: string;
}

interface Job {
  id: string;
  title: string;
  description?: string;
  is_active: boolean;
}

interface AiInterview {
  id: string;
  token: string;
  candidate_name: string;
  candidate_email: string | null;
  role_title: string;
  language: string;
  duration_minutes: number;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  video_path: string | null;
  report_generated_at: string | null;
  created_at: string;
  overall_percent: number | null;
  verdict: string | null;
}

const LANGUAGES = [
  { value: "en-IN", label: "English (India)" },
  { value: "hi-IN", label: "Hindi" },
];

const DURATIONS = [15, 30, 45];

const inputCls =
  "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20";

const chipBase = "inline-block whitespace-nowrap text-xs font-medium px-2 py-0.5 rounded-full border";

/** The evaluated chip is coloured by the verdict, not merely by "it finished".
 *  A 14% NOT RECOMMENDED result must not read as a green pass at a glance. */
function verdictTone(verdict: string | null): string {
  const v = (verdict ?? "").toUpperCase();
  if (v.includes("STRONG") || v.includes("RECOMMENDED TO PROGRESS")) {
    return "bg-green-50 text-green-700 border-green-200";
  }
  if (v.includes("CAUTION")) return "bg-amber-50 text-amber-700 border-amber-200";
  if (v.includes("NOT RECOMMENDED")) return "bg-red-50 text-red-600 border-red-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}

function StatusChip({ iv }: { iv: AiInterview }) {
  switch (iv.status) {
    case "pending":
      return <span className={`${chipBase} bg-blue-50 text-blue-700 border-blue-200`}>Pending</span>;
    case "in_progress":
      return <span className={`${chipBase} bg-amber-50 text-amber-700 border-amber-200`}>In progress</span>;
    case "completed":
      return <span className={`${chipBase} bg-violet-50 text-violet-700 border-violet-200`}>Evaluating…</span>;
    case "evaluated":
      return (
        <span className="flex flex-col items-start gap-1">
          <span className={`${chipBase} ${verdictTone(iv.verdict)}`}>
            {iv.overall_percent != null ? `${iv.overall_percent}%` : "Evaluated"}
          </span>
          {iv.verdict && (
            <span className="text-[11px] leading-tight text-gray-500">{iv.verdict}</span>
          )}
        </span>
      );
    case "expired":
      return <span className={`${chipBase} bg-gray-100 text-gray-600 border-gray-300`}>Expired</span>;
    case "error":
      return <span className={`${chipBase} bg-red-50 text-red-600 border-red-200`}>Error</span>;
    default:
      return <span className={`${chipBase} bg-gray-50 text-gray-600 border-gray-200`}>{iv.status}</span>;
  }
}

export default function AiInterviewsTab({ candidates, jobs }: { candidates: Candidate[]; jobs: Job[] }) {
  const [interviews, setInterviews] = useState<AiInterview[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [candMode, setCandMode] = useState<"existing" | "manual">(candidates.length > 0 ? "existing" : "manual");
  const [candFilter, setCandFilter] = useState("");
  const [candId, setCandId] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [jdMode, setJdMode] = useState<"pick" | "paste">(jobs.length > 0 ? "pick" : "paste");
  const [jobId, setJobId] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [jdText, setJdText] = useState("");
  const [language, setLanguage] = useState("en-IN");
  const [duration, setDuration] = useState(30);
  const [emailInvite, setEmailInvite] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string; name: string; emailSent: boolean } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const fetchInterviews = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-interviews");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.interviews)) setInterviews(data.interviews);
    } catch {
      // network hiccup, keep the current list
    } finally {
      setLoaded(true);
    }
  }, []);

  // Initial load + 15s polling while the tab is visible
  useEffect(() => {
    fetchInterviews();
    const interval = setInterval(() => {
      if (!document.hidden) fetchInterviews();
    }, 15_000);
    const onVisible = () => {
      if (!document.hidden) fetchInterviews();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [fetchInterviews]);

  const filteredCandidates = useMemo(() => {
    const q = candFilter.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      [c.full_name, c.name, c.email, c.current_role, c.current_company]
        .filter(Boolean)
        .some((f) => (f as string).toLowerCase().includes(q))
    );
  }, [candidates, candFilter]);

  const selectedCandidate = candidates.find((c) => c.id === candId);
  const effectiveEmail = candMode === "existing" ? selectedCandidate?.email ?? "" : manualEmail.trim();
  const canSubmit =
    (candMode === "existing" ? !!candId : !!manualName.trim()) &&
    (jdMode === "pick" ? !!jobId : !!roleTitle.trim());

  function resetForm() {
    setCandId("");
    setCandFilter("");
    setManualName("");
    setManualEmail("");
    setJobId("");
    setRoleTitle("");
    setJdText("");
    setEmailInvite(false);
    setCreated(null);
    setCreateError(null);
  }

  async function createInterview() {
    if (!canSubmit || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const payload: Record<string, unknown> = {
        language,
        duration_minutes: duration,
        send_email: emailInvite && !!effectiveEmail,
      };
      if (candMode === "existing") {
        payload.candidate_id = candId;
      } else {
        payload.candidate_name = manualName.trim();
        if (manualEmail.trim()) payload.candidate_email = manualEmail.trim();
      }
      if (jdMode === "pick") {
        payload.jd_id = jobId;
        const job = jobs.find((j) => j.id === jobId);
        if (job) payload.role_title = job.title;
      } else {
        payload.role_title = roleTitle.trim();
        if (jdText.trim()) payload.jd_text = jdText.trim();
      }

      const res = await fetch("/api/ai-interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error ?? "Failed to create interview");
        return;
      }

      const iv = data.interview;
      setInterviews((prev) => [
        {
          id: iv.id,
          token: iv.token,
          candidate_name: iv.candidate_name,
          candidate_email: iv.candidate_email,
          role_title: iv.role_title,
          language: iv.language,
          duration_minutes: iv.duration_minutes,
          status: iv.status,
          started_at: iv.started_at,
          ended_at: iv.ended_at,
          video_path: iv.video_path,
          report_generated_at: iv.report_generated_at,
          created_at: iv.created_at,
          overall_percent: null,
          verdict: null,
        },
        ...prev,
      ]);
      setCreated({ url: data.interview_url, name: iv.candidate_name, emailSent: !!data.email_sent });
      try {
        await navigator.clipboard.writeText(data.interview_url);
        showToast("Interview created. Link copied to clipboard.");
      } catch {
        showToast("Interview created");
      }
    } catch {
      setCreateError("Something went wrong. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  function copyLink(iv: AiInterview) {
    const url = `${window.location.origin}/interview/${iv.token}`;
    navigator.clipboard.writeText(url).then(
      () => {
        setCopiedId(iv.id);
        setTimeout(() => setCopiedId((prev) => (prev === iv.id ? null : prev)), 2000);
      },
      () => showToast("Couldn't copy. Please copy the link manually.")
    );
  }

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl border shadow-sm p-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900 mb-1">AI interviews</h3>
          <p className="text-sm text-gray-400">
            Send candidates a link to a live, voice-based AI interview. A full assessment report lands here when they finish.
          </p>
        </div>
        <button
          onClick={() => {
            setShowCreate((v) => !v);
            if (!showCreate) resetForm();
          }}
          className="shrink-0 px-4 py-2 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all"
          style={{ background: SHIPROCKET_ORANGE }}
        >
          {showCreate ? "Close" : "+ New interview"}
        </button>
      </div>

      {/* Create panel */}
      {showCreate && (
        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-5">
          {created ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(242,101,34,0.1)" }}>
                  <Check className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Interview created for {created.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Share this link with the candidate. It opens their interview room.
                    {created.emailSent && " Invite email sent."}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 rounded-xl bg-gray-50 border border-gray-200 px-4 py-2.5 text-xs text-gray-700 break-all font-mono">
                  {created.url}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(created.url);
                    showToast("Link copied to clipboard");
                  }}
                  className="px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors shrink-0"
                >
                  Copy link
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={resetForm}
                  className="px-4 py-2 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all"
                  style={{ background: SHIPROCKET_ORANGE }}
                >
                  Create another
                </button>
                <button
                  onClick={() => {
                    setShowCreate(false);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-500 text-sm font-medium rounded-xl hover:text-gray-700"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Candidate */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Candidate</p>
                  <div className="flex gap-1">
                    {(["existing", "manual"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setCandMode(m)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          candMode === m ? "bg-orange-50 text-orange-700 border border-orange-200" : "text-gray-400 hover:text-gray-600"
                        }`}
                      >
                        {m === "existing" ? "Pick candidate" : "Enter manually"}
                      </button>
                    ))}
                  </div>
                </div>
                {candMode === "existing" ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={candFilter}
                      onChange={(e) => setCandFilter(e.target.value)}
                      placeholder="Search by name, email, role…"
                      className={inputCls}
                    />
                    <select value={candId} onChange={(e) => setCandId(e.target.value)} className={inputCls}>
                      <option value="">Select a candidate ({filteredCandidates.length})</option>
                      {filteredCandidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {(c.full_name ?? c.name ?? c.email) + (c.current_role ? `, ${c.current_role}` : "")}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="Candidate name"
                      className={inputCls}
                    />
                    <input
                      type="email"
                      value={manualEmail}
                      onChange={(e) => setManualEmail(e.target.value)}
                      placeholder="Email (optional)"
                      className={inputCls}
                    />
                  </div>
                )}
              </div>

              {/* Role / JD */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</p>
                  <div className="flex gap-1">
                    {(["pick", "paste"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setJdMode(m)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          jdMode === m ? "bg-orange-50 text-orange-700 border border-orange-200" : "text-gray-400 hover:text-gray-600"
                        }`}
                      >
                        {m === "pick" ? "Pick JD" : "Paste JD"}
                      </button>
                    ))}
                  </div>
                </div>
                {jdMode === "pick" ? (
                  <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={inputCls}>
                    <option value="">Select a job description</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.title}
                        {j.is_active ? "" : " (inactive)"}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={roleTitle}
                      onChange={(e) => setRoleTitle(e.target.value)}
                      placeholder="Role title (e.g. Senior Backend Engineer)"
                      className={inputCls}
                    />
                    <textarea
                      value={jdText}
                      onChange={(e) => setJdText(e.target.value)}
                      placeholder="Paste the job description here (optional but recommended)…"
                      className={`${inputCls} min-h-[120px] resize-y`}
                    />
                  </div>
                )}
              </div>

              {/* Settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Language</p>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inputCls}>
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Duration</p>
                  <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputCls}>
                    {DURATIONS.map((d) => (
                      <option key={d} value={d}>{d} minutes</option>
                    ))}
                  </select>
                </div>
              </div>

              {createError && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-xs text-red-700">{createError}</div>
              )}

              <div className="flex items-center gap-4 flex-wrap">
                <button
                  onClick={createInterview}
                  disabled={!canSubmit || creating}
                  className="px-5 py-2.5 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:opacity-90 transition-all flex items-center gap-2"
                  style={{ background: SHIPROCKET_ORANGE }}
                >
                  {creating ? (
                    <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating…</>
                  ) : (
                    "Create & copy link"
                  )}
                </button>
                {effectiveEmail && (
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emailInvite}
                      onChange={(e) => setEmailInvite(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 accent-orange-500"
                    />
                    Email invite to <span className="font-medium text-gray-800">{effectiveEmail}</span>
                  </label>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* List */}
      {!loaded ? (
        <div className="bg-white rounded-xl border shadow-sm p-10 text-center">
          <span className="inline-block w-5 h-5 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
        </div>
      ) : interviews.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto" style={{ background: "rgba(242,101,34,0.1)" }}>
            <Mic className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-gray-900">No AI interviews yet</p>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            Create an interview link, send it to a candidate, and they&rsquo;ll be interviewed live by an AI interviewer.
            The assessment report, with scores, verdict, and evidence, appears here when they finish.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">
              All interviews <span className="text-sm text-gray-400 font-normal ml-1">({interviews.length})</span>
            </h2>
            <span className="text-xs text-muted-foreground">Auto-refreshes every 15s</span>
          </div>
          <div className="px-5 py-2 border-b bg-gray-50 grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <div className="col-span-4">Candidate</div>
            <div className="col-span-2">Role</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Created</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          <div className="divide-y">
            {interviews.map((iv) => (
              <div key={iv.id} className="px-5 py-3 grid grid-cols-12 gap-2 items-center hover:bg-orange-50/30 transition-colors">
                <div className="col-span-4 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{iv.candidate_name}</p>
                  {iv.candidate_email && <p className="text-xs text-gray-400 truncate">{iv.candidate_email}</p>}
                </div>
                <div className="col-span-2 min-w-0">
                  <p className="text-xs text-gray-700 truncate">{iv.role_title}</p>
                  <p className="text-xs text-gray-400">{iv.duration_minutes}m · {iv.language === "hi-IN" ? "Hindi" : "English"}</p>
                </div>
                <div className="col-span-2 min-w-0">
                  <StatusChip iv={iv} />
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">
                    {new Date(iv.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}{" "}
                    {new Date(iv.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="col-span-2 flex justify-end">
                  {(iv.status === "pending" || iv.status === "in_progress") && (
                    <button
                      onClick={() => copyLink(iv)}
                      className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:border-gray-300 transition-colors whitespace-nowrap"
                    >
                      {copiedId === iv.id ? "Copied" : "Copy link"}
                    </button>
                  )}
                  {iv.status === "evaluated" && (
                    <Link
                      href={`/employer/report/${iv.id}`}
                      className="px-3 py-1.5 text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all whitespace-nowrap"
                      style={{ background: SHIPROCKET_ORANGE }}
                    >
                      View report
                    </Link>
                  )}
                  {iv.status === "completed" && (
                    <button
                      disabled
                      className="px-3 py-1.5 border border-gray-200 text-gray-400 text-xs font-medium rounded-lg cursor-not-allowed whitespace-nowrap"
                    >
                      Report pending
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
