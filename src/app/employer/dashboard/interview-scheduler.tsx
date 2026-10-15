"use client";

import { useState, useEffect } from "react";

const SHIPROCKET_ORANGE = "#7C3AED";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function CalendarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [view, setView] = useState(() => {
    const d = value ? new Date(value + "T00:00:00") : today;
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const firstDay = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();

  function select(day: number) {
    const d = new Date(view.year, view.month, day);
    if (d < today) return;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    onChange(`${y}-${m}-${dd}`);
  }

  function isSelected(day: number) {
    if (!value) return false;
    const d = new Date(value + "T00:00:00");
    return d.getFullYear() === view.year && d.getMonth() === view.month && d.getDate() === day;
  }

  function isPast(day: number) {
    return new Date(view.year, view.month, day) < today;
  }

  function prevMonth() {
    setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 });
  }
  function nextMonth() {
    setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 });
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="w-7 h-7 rounded-full hover:bg-gray-100 text-gray-500 flex items-center justify-center text-sm">‹</button>
        <span className="text-sm font-semibold text-gray-900">{MONTHS[view.month]} {view.year}</span>
        <button onClick={nextMonth} className="w-7 h-7 rounded-full hover:bg-gray-100 text-gray-500 flex items-center justify-center text-sm">›</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => (
          <button
            key={day}
            onClick={() => select(day)}
            disabled={isPast(day)}
            className={`w-8 h-8 rounded-full text-xs mx-auto flex items-center justify-center transition-colors ${
              isSelected(day)
                ? "text-white font-bold"
                : isPast(day)
                ? "text-gray-200 cursor-not-allowed"
                : "text-gray-700 hover:bg-violet-50 hover:text-violet-700"
            }`}
            style={isSelected(day) ? { background: SHIPROCKET_ORANGE } : {}}
          >
            {day}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  candidateId: string;
  candidateName: string;
  candidateEmail?: string;
  round?: number;
  defaultEmail?: string;
  onClose: () => void;
  onScheduled: (meetLink: string) => void;
}

export default function InterviewScheduler({ candidateId, candidateName, candidateEmail = "", round = 1, defaultEmail = "", onClose, onScheduled }: Props) {
  const [interviewerName, setInterviewerName] = useState("");
  const [interviewerEmail, setInterviewerEmail] = useState(defaultEmail);
  const [candidateEmailInput, setCandidateEmailInput] = useState(candidateEmail);
  const [extraEmails, setExtraEmails] = useState([""]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(45);
  const [loading, setLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{ meet_link: string; calendar_connected: boolean; calendar_error?: string } | null>(null);

  useEffect(() => {
    fetch("/api/calendar/status")
      .then(r => r.json())
      .then(d => setCalendarConnected(d.connected))
      .catch(() => setCalendarConnected(false));
  }, []);

  async function schedule() {
    if (!date || !time || !interviewerName) return;
    setLoading(true);
    setScheduleError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const scheduledAt = new Date(`${date}T${time}:00+05:30`).toISOString();
      const allAttendees = [
        candidateEmailInput,
        interviewerEmail,
        "hr@shiprocket.com",
        ...extraEmails.filter(e => e.trim()),
      ].filter(Boolean);

      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: candidateId,
          candidate_name: candidateName,
          interviewer_name: interviewerName,
          interviewer_email: interviewerEmail,
          extra_attendees: allAttendees,
          scheduled_at: scheduledAt,
          duration_minutes: duration,
          round,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.error) {
        setScheduleError(data.error);
      } else {
        setResult(data);
        if (data.meet_link) onScheduled(data.meet_link);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setScheduleError("Request timed out. Check your network and try again.");
      } else {
        setScheduleError(e instanceof Error ? e.message : "Network error — please try again.");
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  const roundLabel = round === 1 ? "Screening Call" : `Interview Round - ${round}`;

  if (result) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full space-y-4 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto text-2xl" style={{ background: "rgba(124,58,237,0.1)" }}>📅</div>
          <h3 className="font-bold text-gray-900">Interview scheduled</h3>
          <p className="text-sm text-gray-500">{roundLabel} with {interviewerName} for {candidateName}</p>
          {result.meet_link ? (
            <>
              <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-700 break-all text-left font-mono">{result.meet_link}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => { navigator.clipboard.writeText(result.meet_link); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all"
                >
                  {copied ? "Copied ✓" : "Copy link"}
                </button>
                <a href={result.meet_link} target="_blank" rel="noopener noreferrer"
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white text-center hover:opacity-90 transition-all"
                  style={{ background: SHIPROCKET_ORANGE }}>
                  Open Meet →
                </a>
              </div>
              <p className="text-xs text-gray-400">Calendar invites sent to {interviewerName}, HR &amp; all added attendees.</p>
            </>
          ) : (
            <div className="rounded-xl bg-violet-50 border border-violet-200 p-3 text-xs text-violet-800 text-left space-y-1">
              {!result.calendar_connected ? (
                <><p className="font-semibold">Google Calendar not connected.</p><a href="/api/calendar/auth" className="font-semibold underline block">Connect Google Calendar →</a></>
              ) : result.calendar_error ? (
                <><p className="font-semibold">Google Calendar error:</p><p>{result.calendar_error}</p><a href="/api/calendar/auth" className="font-semibold underline block mt-1">Re-connect Calendar →</a></>
              ) : (
                <p>Interview saved — no Meet link returned. Try re-connecting your calendar.</p>
              )}
            </div>
          )}
          <button onClick={onClose} className="w-full py-2 text-gray-500 text-sm hover:text-gray-700">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl flex flex-col my-8" style={{ maxHeight: "calc(100vh - 64px)" }}>
        {/* Sticky header with X button */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-bold text-gray-900">Schedule {roundLabel}</h3>
            <p className="text-sm text-gray-500 mt-0.5">for <span className="font-medium">{candidateName}</span></p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-700 text-2xl font-light leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

        {calendarConnected === false && (
          <div className="rounded-xl bg-violet-50 border border-violet-200 p-3 text-xs text-violet-800 flex items-center justify-between">
            <span>Google Calendar not connected — no Meet link will be generated.</span>
            <a href="/api/calendar/auth" className="font-semibold underline whitespace-nowrap ml-2">Connect →</a>
          </div>
        )}
        {calendarConnected === true && (
          <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-xs text-green-800">
            ✓ Google Calendar connected — a Meet link will be auto-generated.
          </div>
        )}

        {/* Candidate Email */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Candidate Email</label>
          <input type="email" value={candidateEmailInput} onChange={e => setCandidateEmailInput(e.target.value)} placeholder="candidate@example.com"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400" />
        </div>

        {/* Interviewer */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Interviewer</label>
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={interviewerName} onChange={e => setInterviewerName(e.target.value)} placeholder="Full name"
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400" />
            <input type="email" value={interviewerEmail} onChange={e => setInterviewerEmail(e.target.value)} placeholder="Business email (e.g. @shiprocket.com)"
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400" />
          </div>
        </div>

        {/* Additional attendees */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Also invite</label>
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
              <span className="text-xs text-gray-500 flex-1">hr@shiprocket.com</span>
              <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">Auto-added</span>
            </div>
            <input type="email" value={extraEmails[0]} onChange={e => setExtraEmails([e.target.value])}
              placeholder="Optional: extra attendee email"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400" />
          </div>
        </div>

        {/* Calendar date picker */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
            Date {date && <span className="text-violet-600 normal-case font-normal">— {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</span>}
          </label>
          <CalendarPicker value={date} onChange={setDate} />
        </div>

        {/* Time */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Time (IST)</label>
          <input type="time" value={time} onChange={e => setTime(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400" />
        </div>

        {/* Duration */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Duration</label>
          <div className="flex gap-2">
            {[30, 45, 60, 90].map(d => (
              <button key={d} onClick={() => setDuration(d)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${duration === d ? "border-violet-400 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                {d}m
              </button>
            ))}
          </div>
        </div>

        {scheduleError && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800">{scheduleError}</div>
        )}

        {(!date || !interviewerName) && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2 border border-amber-200">
            {!interviewerName && !date ? "Fill in interviewer name and pick a date to continue." : !interviewerName ? "Add interviewer name to continue." : "Pick a date to continue."}
          </p>
        )}

        <button onClick={schedule} disabled={loading || !date || !interviewerName}
          className="w-full py-3 text-white font-semibold rounded-xl text-sm disabled:opacity-40 hover:opacity-90 transition-all"
          style={{ background: SHIPROCKET_ORANGE }}>
          {loading ? "Scheduling… (up to 20s)" : "Schedule & create Meet link →"}
        </button>
        {loading && (
          <button onClick={onClose} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700">
            Cancel
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
