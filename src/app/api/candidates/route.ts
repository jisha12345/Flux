import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("job_id");
  const status = searchParams.get("status");

  const supabase = await createServerSupabaseClient();
  let query = supabase.from("candidates").select("*").order("ai_score", { ascending: false });

  if (jobId) query = query.eq("job_id", jobId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ candidates: data });
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, status } = await request.json();
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("candidates")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ candidate: data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
