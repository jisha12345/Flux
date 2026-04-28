import { NextRequest, NextResponse } from "next/server";
import { getAnthropic } from "@/lib/claude";

export async function POST(req: NextRequest) {
  try {
    const { candidate, response, assessment } = await req.json();
    const jd = assessment?.jd_content || {};

    const prompt = `You are a senior hiring manager at Shiprocket, an AI-first Indian product company.

Analyze this candidate's fit for the role and provide a structured hiring recommendation.

JOB DESCRIPTION:
Role: ${assessment?.role || jd.title || "Not specified"}
${jd.about_role ? `About: ${jd.about_role}` : ""}
${jd.responsibilities?.length ? `Responsibilities: ${(jd.responsibilities as string[]).slice(0, 5).join("; ")}` : ""}
${jd.requirements?.length ? `Requirements: ${(jd.requirements as string[]).slice(0, 5).join("; ")}` : ""}
${jd.ai_expectations ? `AI expectations: ${jd.ai_expectations}` : ""}

CANDIDATE PROFILE:
Name: ${candidate.full_name}
Current: ${candidate.current_role} at ${candidate.current_company}
Experience: ${candidate.total_experience} years
Skills: ${candidate.skills?.join(", ") || "Not specified"}
Profile score: ${candidate.score}/100
${candidate.score_breakdown?.summary ? `Profile summary: ${candidate.score_breakdown.summary}` : ""}
${candidate.ai_tools_used ? `AI tools: ${candidate.ai_tools_used}` : ""}
${candidate.biggest_build ? `Biggest build: ${candidate.biggest_build}` : ""}
${candidate.why_us ? `Why us: ${candidate.why_us}` : ""}

SCREENING ASSESSMENT:
${response
  ? `Score: ${response.score}/100\nFlagged: ${response.flagged ? "Yes — integrity violations detected" : "No"}\n${response.violations_count > 0 ? `Violations: ${response.violations_count}` : ""}`
  : "Candidate has not taken the screening assessment yet."}

Return ONLY valid JSON, no markdown:
{
  "match_score": <0-100>,
  "recommendation": "Strong hire",
  "summary": "<2-3 sentence overall assessment>",
  "strengths": ["<strength>", "<strength>", "<strength>"],
  "gaps": ["<gap>", "<gap>"],
  "hiring_note": "<1 sentence action item for recruiter>",
  "integrity_note": <null or "string if flagged">
}

recommendation must be exactly one of: "Strong hire", "Consider", "Pass"`;

    const msg = await getAnthropic().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = (msg.content[0] as { type: string; text: string }).text;
    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const summary = JSON.parse(clean);

    return NextResponse.json({ success: true, summary });
  } catch (err) {
    console.error("Match summary error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
