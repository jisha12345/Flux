import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const skill = searchParams.get("skill");
  const minScore = searchParams.get("min_score");

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("candidates")
    .select("*")
    .order("ai_score", { ascending: false });

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,current_role.ilike.%${q}%`);
  }
  if (skill) {
    // Older rows carry a comma-separated key_skills string; newer ones a
    // skills array — match either so search covers the whole table.
    query = query.or(`skills.cs.{"${skill}"},key_skills.ilike.%${skill}%`);
  }
  if (minScore) {
    query = query.gte("ai_score", parseInt(minScore));
  }

  const { data, error } = await query.limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ candidates: data });
}
