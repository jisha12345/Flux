/**
 * Post-interview evaluation: transcript + JD + CV + blueprint → InterviewReport
 * (the Hyr assessment format). Tier labels and the verdict are derived here in
 * exactly one place — the model proposes scores and narrative only.
 */
import { env } from "./env.js";
import { anthropic, extractJson } from "./interview-engine.js";
import { loadTurns, updateInterview } from "./supabase.js";
import {
  tierForScore,
  verdictForPercent,
  type AiInterviewRow,
  type CompetencyResult,
  type InterviewReport,
  type RiskLevel,
} from "./types.js";

function round1(n: number): number {
  return Math.round(Math.min(10, Math.max(0, n)) * 10) / 10;
}

type RawReport = Omit<InterviewReport, "verdict" | "competencies"> & {
  competencies: Omit<CompetencyResult, "tier">[];
};

function buildPrompt(row: AiInterviewRow, transcript: string): string {
  const competencies = row.blueprint?.competencies?.length
    ? row.blueprint.competencies.join("; ")
    : "(derive 8 role-appropriate competencies yourself)";
  const isExec = row.blueprint?.role_level === "executive";

  return `You are a senior assessment writer producing a formal candidate assessment report from a first-round AI interview. Your writing style: third person, past tense, measured, consultative, evidence-anchored — every claim grounded in specific companies, projects, metrics, or statements from the transcript. Every strength is paired with a calibration caveat. Watch areas are framed as gaps/unknowns to validate, never as failures. Never quote question-answer pairs verbatim; synthesize.

CANDIDATE: ${row.candidate_name}
ROLE: ${row.role_title} at ${row.company_name}
ROLE LEVEL: ${row.blueprint?.role_level ?? "unknown"}

JOB DESCRIPTION:
${row.jd_text ?? "(not provided)"}

CANDIDATE CV:
${row.cv_text ?? "(not provided)"}

THE 8 COMPETENCIES TO SCORE (use these names verbatim, in this order): ${competencies}

FULL INTERVIEW TRANSCRIPT:
${transcript}

Produce a JSON assessment:
{
  "overall_percent": <0-100 integer — your holistic hire-signal for this role at this level; calibrate honestly: 88+ only for genuinely exceptional interviews, 75-87 solid candidates worth progressing, 60-74 notable concerns, below 60 poor fit. A thin, evasive, or very short interview MUST score low>,
  "interview_stage": "Experience Round",
  "executive_summary": ["<paragraph: background + the strongest evidence from the interview>", "<paragraph: role fit + explicit statement of what was less complete and should be validated next round>"],
  "summary_stats": [<exactly 3 thematic rollups: { "label": "<2-3 word theme>", "score": <0-10, one decimal>, "caption": "<one line>" }>],
  "hiring_conclusion": { "label": "<2-4 word imperative, e.g. 'Progress to final round.' or 'Do not progress.'>", "text": "<1-2 sentences>" },
  "competencies": [<exactly 8, matching the given names/order: { "name": "...", "score": <0-10 one decimal>, "narrative": "<one paragraph of what they demonstrated>", "evidence": [<3-4 concrete bullets citing specifics from the transcript>], "observation": "<one sentence hiring observation>" }>],
  "business_impact": [<up to 6 REAL metrics the candidate stated (revenue, growth %, team size, timelines): { "label": "<small-caps metric label>", "value": "<the figure as stated, e.g. '3.2x' or '₹12 Cr ARR'>", "caption": "<one line of context>" }. Only metrics actually mentioned — if few were given, return fewer; never invent>],
  "strengths": [<4-5 short noun-phrase bullets>],
  "watch_areas": [<4-5 short phrases framed as things to validate>],
  "assessment_note": "<one italic-style calibrating sentence putting watch areas in perspective>",
  "role_fit": ${isExec ? `{ "strongest_match": "<sentence>", "environment_fit": "<sentence>", "role_risk": "<sentence>", "level_calibration": "<sentence>" }` : "null"},
  "risk_calibration": ${isExec ? `[{ "label": "EXECUTION RISK", "level": "LOW|MEDIUM|HIGH" }, { "label": "GOVERNANCE RISK", "level": "..." }, { "label": "COMMUNICATION RISK", "level": "..." }]` : "null"},
  "why_progress": [<5 concrete-achievement bullets — if the candidate should NOT progress, instead list the 5 decisive observations behind that>],
  "final_round_focus": [<exactly 4: { "label": "<2-3 word topic>", "text": "<one-sentence instruction to the next interviewer>" }>],
  "final_assessment": ["<paragraph starting with the candidate's full name, synthesizing the profile>", "<closing paragraph referencing the overall percentage and ending with a conditional recommendation sentence>"]
}

Respond with ONLY the JSON object.`;
}

export async function evaluateInterview(row: AiInterviewRow): Promise<void> {
  console.log(`[evaluate] starting for interview ${row.id}`);
  const turns = await loadTurns(row.id);
  const spoken = turns.filter((t) => t.role !== "system");
  if (spoken.length < 2) {
    console.error(`[evaluate] interview ${row.id} has no usable transcript`);
    await updateInterview(row.id, { status: "error" });
    return;
  }

  const transcript = spoken
    .map((t) => {
      const who = t.role === "interviewer" ? "Interviewer" : row.candidate_name;
      const section = t.section ? ` [section: ${t.section}]` : "";
      return `${who}${section}: ${t.text}`;
    })
    .join("\n\n");

  const prompt = buildPrompt(row, transcript);

  let raw: RawReport | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2 && !raw; attempt += 1) {
    try {
      const response = await anthropic.messages.create({
        model: env.EVAL_MODEL,
        max_tokens: 12000,
        messages: [{ role: "user", content: prompt }],
      });
      // Claude 5 may lead with a thinking block — join every text block.
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => (block as { text: string }).text)
        .join("\n");
      raw = extractJson<RawReport>(text);
    } catch (err) {
      lastError = err;
      console.error(`[evaluate] attempt ${attempt + 1} failed:`, err);
    }
  }
  if (!raw) {
    console.error(`[evaluate] giving up for ${row.id}:`, lastError);
    return; // status stays 'completed' — retriable via POST /evaluate/:token
  }

  // Derivations happen HERE, once — never trust model-assigned tiers/verdicts.
  const overall = Math.round(Math.min(100, Math.max(0, raw.overall_percent)));
  const report: InterviewReport = {
    ...raw,
    overall_percent: overall,
    verdict: verdictForPercent(overall),
    interview_stage: raw.interview_stage || "Experience Round",
    summary_stats: (raw.summary_stats ?? []).slice(0, 3).map((s) => ({ ...s, score: round1(s.score) })),
    competencies: (raw.competencies ?? []).slice(0, 8).map((c) => {
      const score = round1(c.score);
      return { ...c, score, tier: tierForScore(score) };
    }),
    business_impact: (raw.business_impact ?? []).slice(0, 6),
    role_fit: raw.role_fit ?? null,
    risk_calibration:
      raw.risk_calibration?.map((r) => ({
        label: r.label,
        level: (["LOW", "MEDIUM", "HIGH"].includes(r.level) ? r.level : "MEDIUM") as RiskLevel,
      })) ?? null,
    final_round_focus: (raw.final_round_focus ?? []).slice(0, 4),
  };

  await updateInterview(row.id, {
    report,
    report_generated_at: new Date().toISOString(),
    status: "evaluated",
  });
  console.log(`[evaluate] done for ${row.id}: ${report.overall_percent}% ${report.verdict}`);
}
