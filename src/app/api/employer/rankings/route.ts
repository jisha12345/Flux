import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("job_id");

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("candidates")
    .select("*")
    .eq("job_id", jobId ?? "")
    .order("ai_score", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rankings: data });
}
