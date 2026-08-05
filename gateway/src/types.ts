/**
 * Gateway-side copy of the shared contracts in ../src/lib/interview-types.ts.
 * The gateway is a separate package, so the types are mirrored — keep in sync.
 */

export type Verdict =
  | "STRONG HIRE"
  | "RECOMMENDED TO PROGRESS"
  | "PROCEED WITH CAUTION"
  | "NOT RECOMMENDED";

export type CompetencyTier = "Exceptional" | "Strong" | "Good" | "Developing" | "Weak";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface CompetencyResult {
  name: string;
  score: number;
  tier: CompetencyTier;
  narrative: string;
  evidence: string[];
  observation: string;
}

export interface StatTile {
  label: string;
  score: number;
  caption: string;
}

export interface ImpactTile {
  label: string;
  value: string;
  caption: string;
}

export interface FocusCard {
  label: string;
  text: string;
}

export interface InterviewReport {
  overall_percent: number;
  verdict: Verdict;
  interview_stage: string;
  executive_summary: [string, string];
  summary_stats: StatTile[];
  hiring_conclusion: { label: string; text: string };
  competencies: CompetencyResult[];
  business_impact: ImpactTile[];
  strengths: string[];
  watch_areas: string[];
  assessment_note: string;
  role_fit?: {
    strongest_match: string;
    environment_fit: string;
    role_risk: string;
    level_calibration: string;
  } | null;
  risk_calibration?: { label: string; level: RiskLevel }[] | null;
  why_progress: string[];
  final_round_focus: FocusCard[];
  final_assessment: [string, string];
}

/** THE single source of tier labels — never let the model assign tiers. */
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

export interface BlueprintSection {
  id: string;
  title: string;
  minutes: number;
  probes: string[];
}

export interface InterviewBlueprint {
  role_level: "executive" | "senior" | "mid" | "junior";
  persona_name: string;
  sections: BlueprintSection[];
  competencies: string[];
  candidate_context: string;
  role_context: string;
}

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
  language: string;
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

export interface TurnRow {
  id: string;
  interview_id: string;
  seq: number;
  role: "interviewer" | "candidate" | "system";
  text: string;
  section: string | null;
  created_at: string;
}
