import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { anthropic } from "@/lib/claude";

export async function POST(request: NextRequest) {
  try {
    const { job_id, job_description } = await request.json();
    const supabase = await createServerSupabaseClient();

    const { data: candidates } = await supabase
      .from("candidates")
      .select("name:full_name, ai_score, ai_summary, ai_dimensions")
      .eq("job_id", job_id)
      .not("ai_score", "is", null)
      .order("ai_score", { ascending: false })
      .limit(10);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `Summarize the top candidates for this role: ${job_description}\n\nCandidates:\n${JSON.stringify(candidates, null, 2)}\n\nWrite a 3-5 sentence hiring manager summary highlighting the strongest candidates and any patterns in the pool.`,
      }],
    });

    const summary = response.content[0].type === "text" ? response.content[0].text : "";
    return NextResponse.json({ summary });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
  }
}
