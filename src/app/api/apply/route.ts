import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { anthropic } from "@/lib/claude";
import { CandidateApplication, ScoreBreakdown } from "@/lib/types";

async function scoreCandidate(application: CandidateApplication): Promise<ScoreBreakdown> {
  const prompt = `You are a senior technical recruiter at a fast-moving AI-first startup.
Score this candidate application from 0-100 across 4 dimensions.

Candidate: ${application.full_name}
Role: ${application.current_role} at ${application.current_company}
Experience: ${application.total_experience} years
CTC: Current ${application.current_ctc} / Expected ${application.expected_ctc}
Notice Period: ${application.notice_period}
WFH Preference: ${application.wfh_preference}

AI Questions:
1. AI comfort self-score: ${application.ai_comfort_score}/10
2. AI tools they use: ${application.ai_tools_used}
3. What they built with AI: ${application.ai_project_built}
4. Their vision for AI in their role: ${application.ai_future_vision}
5. How they'd feel working without AI: ${application.ai_without_tools_feeling}
6. Biggest thing they've built: ${application.biggest_build}
7. Why they want to work with us: ${application.why_us}

Score across:
- ai_depth (0-25): Depth of real AI usage, not just buzzwords
- communication (0-25): Clarity, specificity, personality in answers
- experience_relevance (0-25): Relevant background and what they've shipped
- ambition (0-25): Drive, curiosity, growth mindset

Respond with ONLY valid JSON, no markdown:
{
  "ai_depth": <0-25>,
  "communication": <0-25>,
  "experience_relevance": <0-25>,
  "ambition": <0-25>,
  "total": <0-100>,
  "summary": "<2 sentence recruiter note on this candidate>"
}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (message.content[0] as { type: string; text: string }).text;
  return JSON.parse(text) as ScoreBreakdown;
}

export async function POST(req: NextRequest) {
  try {
    const body: CandidateApplication = await req.json();

    const scoreBreakdown = await scoreCandidate(body);

    const { data, error } = await supabaseAdmin
      .from("candidates")
      .insert([
        {
          ...body,
          score: scoreBreakdown.total,
          score_breakdown: scoreBreakdown,
          status: "new",
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, id: data.id, score: scoreBreakdown.total });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Submission failed" }, { status: 500 });
  }
}
