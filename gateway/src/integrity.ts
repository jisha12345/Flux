import type {
  IntegrityEventType,
  IntegrityRiskLevel,
  IntegritySummary,
  TurnRow,
} from "./types.js";

const PREFIX = "[integrity-event] ";
const EVENT_TYPES = new Set<IntegrityEventType>([
  "tab_hidden",
  "window_blur",
  "fullscreen_exit",
  "long_break",
]);

export interface IntegrityEvent {
  event_type: IntegrityEventType;
  occurred_at: string;
  duration_seconds: number;
}

function clampDuration(value: unknown): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.round(Math.min(6 * 60 * 60, Math.max(0, parsed)));
}

export function serializeIntegrityEvent(event: IntegrityEvent): string {
  return `${PREFIX}${JSON.stringify({
    event_type: event.event_type,
    occurred_at: event.occurred_at,
    duration_seconds: clampDuration(event.duration_seconds),
  })}`;
}

export function parseIntegrityEvent(text: string): IntegrityEvent | null {
  if (!text.startsWith(PREFIX)) return null;
  try {
    const parsed = JSON.parse(text.slice(PREFIX.length)) as Partial<IntegrityEvent>;
    if (!parsed.event_type || !EVENT_TYPES.has(parsed.event_type)) return null;
    const occurredAt = new Date(parsed.occurred_at ?? "");
    if (Number.isNaN(occurredAt.getTime())) return null;
    return {
      event_type: parsed.event_type,
      occurred_at: occurredAt.toISOString(),
      duration_seconds: clampDuration(parsed.duration_seconds),
    };
  } catch {
    return null;
  }
}

export function integrityAdjustment(score: number): number {
  const safeScore = Math.min(100, Math.max(0, Math.round(score)));
  if (safeScore === 100) return 0;
  return -Math.min(20, Math.ceil((100 - safeScore) / 5));
}

export function summarizeIntegrity(turns: TurnRow[]): IntegritySummary {
  const events = turns
    .filter((turn) => turn.role === "system")
    .map((turn) => parseIntegrityEvent(turn.text))
    .filter((event): event is IntegrityEvent => event !== null);

  const count = (type: IntegrityEventType) =>
    events.filter((event) => event.event_type === type).length;
  const tabSwitches = count("tab_hidden");
  const windowSwitches = count("window_blur");
  const fullscreenExits = count("fullscreen_exit");
  const longBreaks = count("long_break");
  const awayEvents = events.filter(
    (event) => event.event_type === "tab_hidden" || event.event_type === "window_blur",
  );
  const totalAwaySeconds = awayEvents.reduce(
    (total, event) => total + event.duration_seconds,
    0,
  );
  const longestAwaySeconds = awayEvents.reduce(
    (longest, event) => Math.max(longest, event.duration_seconds),
    0,
  );

  // Tab and window events are de-duplicated in the browser. Caps prevent focus
  // telemetry from overwhelming the evidence-based interview assessment.
  const penalty = Math.min(
    60,
    Math.min(36, tabSwitches * 12) +
      Math.min(18, windowSwitches * 6) +
      Math.min(20, fullscreenExits * 10) +
      Math.min(24, longBreaks * 8),
  );
  const score = 100 - penalty;
  const riskLevel: IntegrityRiskLevel = score >= 85 ? "LOW" : score >= 60 ? "MEDIUM" : "HIGH";
  const observations: string[] = [];
  if (tabSwitches > 0) {
    observations.push(
      `${tabSwitches} tab switch${tabSwitches === 1 ? "" : "es"} recorded` +
        (totalAwaySeconds > 0 ? `; ${totalAwaySeconds}s total away from the interview` : ""),
    );
  }
  if (windowSwitches > 0) {
    observations.push(
      `${windowSwitches} switch${windowSwitches === 1 ? "" : "es"} to another window recorded`,
    );
  }
  if (fullscreenExits > 0) {
    observations.push(
      `${fullscreenExits} fullscreen exit${fullscreenExits === 1 ? "" : "s"} recorded`,
    );
  }
  if (longBreaks > 0) {
    observations.push(
      `${longBreaks} answer break${longBreaks === 1 ? "" : "s"} of at least 60 seconds recorded`,
    );
  }
  if (observations.length === 0) observations.push("No focus or extended-break signals were recorded.");

  return {
    score,
    risk_level: riskLevel,
    tab_switches: tabSwitches,
    window_switches: windowSwitches,
    fullscreen_exits: fullscreenExits,
    long_breaks: longBreaks,
    total_away_seconds: totalAwaySeconds,
    longest_away_seconds: longestAwaySeconds,
    observations,
  };
}
