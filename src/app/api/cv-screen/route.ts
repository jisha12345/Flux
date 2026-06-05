import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { scoreApplication } from "@/lib/claude";

export async function POST(request: NextRequest) {
  try {
    const { candidate_id, job_description } = await request.json();
    const supabase = await createServerSupabaseClient();

    const { data: candidate, error } = await supabase
      .from("candidates")
      .select("*")
      .eq("id", candidate_id)
      .single();

    if (error || !candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

    const scoring = await scoreApplication(job_description, candidate.answers ?? {});

    await supabase
      .from("candidates")
      .update({
        ai_score: scoring.score,
        ai_summary: scoring.summary,
        ai_dimensions: scoring.dimensions,
      })
      .eq("id", candidate_id);

    return NextResponse.json({ scoring });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Screening failed" }, { status: 500 });
  }
}
