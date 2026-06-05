import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { candidate_id } = await request.json();
  const service = createServiceClient();
  const { data: c } = await service.from("candidates").select("*").eq("id", candidate_id).single();
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const profile = [
    c.full_name && `Name: ${c.full_name}`,
    (c.current_role || c.current_company) && `Role: ${[c.current_role, c.current_company].filter(Boolean).join(" at ")}`,
    c.total_experience && `Experience: ${c.total_experience}`,
    c.key_skills && `Skills: ${c.key_skills}`,
    c.current_ctc && `Current CTC: ${c.current_ctc}`,
    c.expected_ctc && `Expected CTC: ${c.expected_ctc}`,
    c.notice_period && `Notice period: ${c.notice_period}`,
    c.ai_comfort_score && `AI comfort: ${c.ai_comfort_score}`,
    c.ai_tools_used && `AI tools used: ${c.ai_tools_used}`,
    c.score != null && `Score: ${c.score}/100`,
    c.profile_summary && `Summary: ${c.profile_summary}`,
  ].filter(Boolean).join("\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    messages: [{
      role: "user",
      content: `You are a senior technical recruiter at Shiprocket (India's leading logistics platform) analysing a candidate profile. Be direct and specific.

${profile}

Respond in valid JSON:
{
  "opportunities": ["3 specific ways this candidate could add value to Shiprocket"],
  "watchout": ["2-3 specific concerns or risks with this candidate"],
  "suggestion": "One clear, actionable recommendation for the recruiter in 2-3 sentences"
}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
  return NextResponse.json(json);
}
