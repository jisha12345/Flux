import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ assessment: data });
}

export async function POST(request: NextRequest) {
  try {
    const { assessment_id, candidate_id, answers, integrity } = await request.json();
    // Service role: candidates submit anonymously, and reading the row back
    // for its id needs a SELECT that anon must not have on submissions.
    const supabase = createServiceClient();

    const integrityScore = integrity
      ? Math.max(0, 100 - (integrity.tab_switches || 0) * 15 - (integrity.focus_losses || 0) * 5 - (integrity.fullscreen_warnings || 0) * 10)
      : 100;

    const { data, error } = await supabase
      .from("assessment_submissions")
      .insert({ assessment_id, candidate_id, answers, integrity_data: integrity ?? {}, integrity_score: integrityScore })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, id: data.id, integrity_score: integrityScore });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to submit" }, { status: 500 });
  }
}
