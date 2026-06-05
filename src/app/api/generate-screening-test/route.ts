import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { job_id, job_description, job_title } = await request.json();

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    messages: [{
      role: "user",
      content: `Create a focused 8-10 minute screening test for this role at Shiprocket.

Role: ${job_title ?? "Tech role"}
JD: ${job_description}

Generate exactly 6 questions that:
- Can realistically be answered well in 8-10 minutes total
- Directly test skills and knowledge FROM the JD (not generic)
- Mix: 2 technical depth questions, 2 practical scenario questions, 1 AI/tools question, 1 culture fit
- Each answer should take ~90 seconds

Respond in JSON:
{
  "title": "Screening Test: <role name>",
  "questions": [
    { "id": "q1", "text": "question text", "type": "text", "hint": "what a good answer looks like in 1 sentence" }
  ],
  "time_limit_minutes": 10
}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

  const { data, error } = await supabase
    .from("assessments")
    .insert({
      job_id: job_id ?? null,
      title: parsed.title ?? `Screening Test: ${job_title ?? "Tech Role"}`,
      questions: parsed.questions ?? [],
      time_limit_minutes: 10,
      assessment_type: "screening",
      jd_brief: job_description?.slice(0, 500),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assessment: data });
}
