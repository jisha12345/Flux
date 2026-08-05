/**
 * Shared contracts for the AI Web Interview platform.
 *
 * Used by: the interview room UI (hook + screens), the report page, the
 * dashboard tab, and mirrored in gateway/src/types.ts for the voice gateway.
 * Keep the two copies in sync — the gateway is a separate package.
 */

// ── Report (matches the Hyr sample assessment PDFs) ─────────────────────────

export type Verdict =
  | "STRONG HIRE"
  | "RECOMMENDED TO PROGRESS"
  | "PROCEED WITH CAUTION"
  | "NOT RECOMMENDED";

export type CompetencyTier = "Exceptional" | "Strong" | "Good" | "Developing" | "Weak";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface CompetencyResult {
  name: string;
  /** 0–10, one decimal place (e.g. 8.7) */
  score: number;
  /** Always derived via tierForScore(score) — never model-assigned. */
  tier: CompetencyTier;
  /** One narrative paragraph, third person, evidence-anchored. */
  narrative: string;
  /** 3–4 concrete evidence bullets from the transcript. */
  evidence: string[];
  /** One italic "Hiring observation:" sentence. */
  observation: string;
}

export interface StatTile {
  label: string;
  /** X/10 */
  score: number;
  caption: string;
}

export interface ImpactTile {
  label: string;
  /** A raw business metric ("3.2x", "45 days", "₹12 Cr ARR") — not a score. */
  value: string;
  caption: string;
}

export interface FocusCard {
  label: string;
  text: string;
}

export interface InterviewReport {
  /** Headline metric, 0–100 integer. Its own figure — not competency average. */
  overall_percent: number;
  /** Always derived via verdictForPercent(overall_percent). */
  verdict: Verdict;
  interview_stage: string; // e.g. "Experience Round"
  /** [background/strongest evidence, role fit + caveats] */
  executive_summary: [string, string];
  /** Exactly 3 thematic rollups. */
  summary_stats: StatTile[];
  hiring_conclusion: { label: string; text: string };
  /** Exactly 8, names generated per role. */
  competencies: CompetencyResult[];
  /** Up to 6 raw metrics pulled from the interview. */
  business_impact: ImpactTile[];
  /** 4–5 short noun-phrase bullets. */
  strengths: string[];
  /** 4–5 short phrases framed as gaps/unknowns, not failures. */
  watch_areas: string[];
  /** One italic calibrating sentence. */
  assessment_note: string;
  /** Executive-level roles only. */
  role_fit?: {
    strongest_match: string;
    environment_fit: string;
    role_risk: string;
    level_calibration: string;
  } | null;
  /** Executive-level roles only. */
  risk_calibration?: { label: string; level: RiskLevel }[] | null;
  /** 5 concrete-achievement bullets. */
  why_progress: string[];
  /** Exactly 4 instructions for the next interviewer. */
  final_round_focus: FocusCard[];
  /** [restates name + evidence, conditional recommendation close] */
  final_assessment: [string, string];
}

/** THE single source of tier labels — the sample PDFs computed this in two
 *  places and disagreed with themselves; we never do. */
export function tierForScore(score: number): CompetencyTier {
  if (score >= 9.2) return "Exceptional";
  if (score >= 8.5) return "Strong";
  if (score >= 7.8) return "Good";
  if (score >= 6.5) return "Developing";
  return "Weak";
}

export function verdictForPercent(percent: number): Verdict {
  if (percent >= 88) return "STRONG HIRE";
  if (percent >= 75) return "RECOMMENDED TO PROGRESS";
  if (percent >= 60) return "PROCEED WITH CAUTION";
  return "NOT RECOMMENDED";
}

/** Hyr report palette — extracted from the sample PDFs. */
export const HYR = {
  primaryDark: "#256649",
  banner: "#459470",
  mint: "#dbede3",
  mintFaint: "#f4faf7",
  mintBorder: "#c8ded3",
  cream: "#fff9ed",
  amber: "#775a12",
  body: "#25332c",
  muted: "#66726c",
  footer: "#8a948f",
} as const;

// ── Interview blueprint (generated from JD + CV before the interview) ───────

export interface BlueprintSection {
  id: string;
  title: string;
  minutes: number;
  probes: string[];
}

export interface InterviewBlueprint {
  role_level: "executive" | "senior" | "mid" | "junior";
  persona_name: string; // the AI interviewer's name, e.g. "Aria"
  sections: BlueprintSection[];
  /** Exactly 8 competency names to score in the report. */
  competencies: string[];
  candidate_context: string;
  role_context: string;
}

// ── DB row ──────────────────────────────────────────────────────────────────

export type InterviewStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "evaluated"
  | "expired"
  | "error";

export interface AiInterviewRow {
  id: string;
  token: string;
  candidate_id: string | null;
  jd_id: string | null;
  candidate_name: string;
  candidate_email: string | null;
  role_title: string;
  company_name: string;
  language: string; // BCP-47-ish Sarvam code: "en-IN" | "hi-IN" | ...
  duration_minutes: number;
  jd_text: string | null;
  cv_text: string | null;
  blueprint: InterviewBlueprint | null;
  status: InterviewStatus;
  identity_photo_path: string | null;
  video_path: string | null;
  started_at: string | null;
  ended_at: string | null;
  report: InterviewReport | null;
  report_generated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Gateway WebSocket protocol ──────────────────────────────────────────────
// Connect: `${NEXT_PUBLIC_INTERVIEW_GATEWAY_URL.replace(/^http/, "ws")}/ws?token=<token>`

/** Browser → gateway (JSON text frames). Audio is base64 PCM16LE mono @ 16 kHz. */
export type InterviewClientFrame =
  | { type: "start" }
  | { type: "audio"; data: string }
  | { type: "barge_in" }
  | { type: "repeat" }
  | { type: "text"; data: string }
  | { type: "end" };

/** Gateway → browser (JSON text frames). Audio is base64 PCM16LE mono. */
export type InterviewGatewayEvent =
  | {
      type: "ready";
      interview: {
        candidate_name: string;
        role_title: string;
        company: string;
        language: string;
        duration_minutes: number;
        sections: { id: string; title: string }[];
      };
    }
  | { type: "status"; data: "listening" | "thinking" | "speaking" }
  | { type: "transcript"; role: "user"; text: string; final: boolean }
  | { type: "assistant_delta"; text: string }
  | { type: "assistant_text"; text: string }
  | { type: "audio"; seq: number; sample_rate: number; data: string }
  | { type: "audio_done" }
  | { type: "interrupted" }
  | { type: "section"; id: string; title: string; index: number; total: number }
  | { type: "completed" }
  | { type: "error"; message: string };

// Gateway HTTP (same origin as the WS URL):
//   GET  /health                        → { ok: true }
//   POST /upload/:token/chunk           raw video/webm chunk body (append)
//   POST /upload/:token/photo           raw image/jpeg body (identity snapshot)
//   POST /upload/:token/finalize        → uploads assembled recording to storage
