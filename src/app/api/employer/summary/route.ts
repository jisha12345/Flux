import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: candidates }, { data: jobs }] = await Promise.all([
    supabase.from("candidates").select("status, ai_score"),
    supabase.from("jobs").select("id, is_active").eq("employer_id", session.user.id),
  ]);

  const summary = {
    total_candidates: candidates?.length ?? 0,
    applied: candidates?.filter(c => c.status === "Applied").length ?? 0,
    shortlisted: candidates?.filter(c => c.status === "Shortlisted").length ?? 0,
    interview: candidates?.filter(c => c.status === "Interview").length ?? 0,
    offer: candidates?.filter(c => c.status === "Offer").length ?? 0,
    avg_score: candidates?.length
      ? Math.round((candidates.filter(c => c.ai_score).reduce((s, c) => s + (c.ai_score ?? 0), 0)) / candidates.filter(c => c.ai_score).length)
      : null,
    active_jobs: jobs?.filter(j => j.is_active).length ?? 0,
  };

  return NextResponse.json({ summary });
}
