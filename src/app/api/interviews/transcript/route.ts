import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { interview_id, transcript, candidate_name, role } = await request.json();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `You are a senior technical recruiter at Shiprocket analysing a job interview transcript. Be specific and actionable.

Candidate: ${candidate_name ?? "Unknown"}
Role: ${role ?? "Tech role"}

INTERVIEW TRANSCRIPT:
${transcript}

Provide a comprehensive analysis in JSON:
{
  "overall_score": <0-100>,
  "recommendation": "Strong Hire" | "Hire" | "Maybe" | "No Hire",
  "summary": "3-4 sentence executive summary of the interview",
  "technical_assessment": {
    "score": <0-100>,
    "strengths": ["specific technical strength from transcript"],
    "gaps": ["specific gap from transcript"],
    "notes": "2-3 sentences on technical depth"
  },
  "communication": {
    "score": <0-100>,
    "notes": "clarity, structure, articulation observed in transcript"
  },
  "culture_fit": {
    "score": <0-100>,
    "notes": "alignment with Shiprocket values, ownership mindset, etc."
  },
  "key_moments": [
    { "quote": "exact quote from transcript", "significance": "what this reveals about the candidate" }
  ],
  "red_flags": ["specific concern from transcript if any"],
  "next_steps": "concrete recommendation on what to do next with this candidate"
}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const analysis = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

  if (interview_id) {
    const service = createServiceClient();
    await service.from("interviews").update({
      transcript,
      ai_analysis: analysis,
      status: "completed",
    }).eq("id", interview_id);
  }

  return NextResponse.json({ analysis });
}
