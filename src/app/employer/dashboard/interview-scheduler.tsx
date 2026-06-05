"use client";

import { useState, useEffect } from "react";

const SHIPROCKET_ORANGE = "#F26522";
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
                : "text-gray-700 hover:bg-orange-50 hover:text-orange-700"
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
  round?: number;
  onClose: () => void;
  onScheduled: (meetLink: string) => void;
}

export default function InterviewScheduler({ candidateId, candidateName, round = 1, onClose, onScheduled }: Props) {
  const [interviewerName, setInterviewerName] = useState("");
  const [interviewerEmail, setInterviewerEmail] = useState("");
  const [extraEmails, setExtraEmails] = useState(["", "", ""]);
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
    try {
      const scheduledAt = new Date(`${date}T${time}:00+05:30`).toISOString();
      const allAttendees = [
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
      });
      const data = await res.json();
      if (data.error) {
        setScheduleError(data.error);
      } else {
        setResult(data);
        if (data.meet_link) onScheduled(data.meet_link);
      }
    } catch (e) {
      setScheduleError(e instanceof Error ? e.message : "Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  const roundLabel = round === 1 ? "Screening Call" : `Interview Round - ${round}`;

  if (result) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full space-y-4 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto text-2xl" style={{ background: "rgba(242,101,34,0.1)" }}>📅</div>
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
            <div className="rounded-xl bg-orange-50 border border-orange-200 p-3 text-xs text-orange-800 text-left space-y-1">
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4 overflow-y-auto">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5 my-8">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900">Schedule {roundLabel}</h3>
            <p className="text-sm text-gray-500 mt-0.5">for <span className="font-medium">{candidateName}</span></p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 text-xl">×</button>
        </div>

        {calendarConnected === false && (
          <div className="rounded-xl bg-orange-50 border border-orange-200 p-3 text-xs text-orange-800 flex items-center justify-between">
            <span>Google Calendar not connected — no Meet link will be generated.</span>
            <a href="/api/calendar/auth" className="font-semibold underline whitespace-nowrap ml-2">Connect →</a>
          </div>
        )}
        {calendarConnected === true && (
          <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-xs text-green-800">
            ✓ Google Calendar connected — a Meet link will be auto-generated.
          </div>
        )}

        {/* Interviewer */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Interviewer</label>
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={interviewerName} onChange={e => setInterviewerName(e.target.value)} placeholder="Full name"
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400" />
            <input type="email" value={interviewerEmail} onChange={e => setInterviewerEmail(e.target.value)} placeholder="email@shiprocket.com"
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400" />
          </div>
        </div>

        {/* Additional attendees */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Also invite (calendars to block)</label>
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
              <span className="text-xs text-gray-500 flex-1">hr@shiprocket.com</span>
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Always included</span>
            </div>
            {extraEmails.map((email, i) => (
              <input key={i} type="email" value={email} onChange={e => setExtraEmails(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                placeholder={`Attendee ${i + 1} email (optional)`}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400" />
            ))}
          </div>
        </div>

        {/* Calendar date picker */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
            Date {date && <span className="text-orange-600 normal-case font-normal">— {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</span>}
          </label>
          <CalendarPicker value={date} onChange={setDate} />
        </div>

        {/* Time */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Time (IST)</label>
          <input type="time" value={time} onChange={e => setTime(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400" />
        </div>

        {/* Duration */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Duration</label>
          <div className="flex gap-2">
            {[30, 45, 60, 90].map(d => (
              <button key={d} onClick={() => setDuration(d)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${duration === d ? "border-orange-400 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                {d}m
              </button>
            ))}
          </div>
        </div>

        {scheduleError && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800">{scheduleError}</div>
        )}

        <button onClick={schedule} disabled={loading || !date || !interviewerName}
          className="w-full py-3 text-white font-semibold rounded-xl text-sm disabled:opacity-40 hover:opacity-90 transition-all"
          style={{ background: SHIPROCKET_ORANGE }}>
          {loading ? "Scheduling…" : "Schedule & create Meet link →"}
        </button>
      </div>
    </div>
  );
}
