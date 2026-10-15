import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const active = searchParams.get("active");

  const supabase = await createServerSupabaseClient();
  let query = supabase.from("jobs").select("id, title, company, skills, created_at").order("created_at", { ascending: false });
  if (active === "true") query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Use service client so jobs without employer_id (created by older code) are also deletable
  const service = createServiceClient();
  const { error } = await service.from("jobs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = await createServerSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: existing } = await supabase
      .from("jobs")
      .select("id")
      .eq("employer_id", session.user.id)
      .eq("title", body.title)
      .maybeSingle();

    let data, error;
    if (existing) {
      ({ data, error } = await supabase
        .from("jobs")
        .update({ ...body, is_active: true })
        .eq("id", existing.id)
        .select()
        .single());
    } else {
      ({ data, error } = await supabase
        .from("jobs")
        .insert({ ...body, employer_id: session.user.id, is_active: true })
        .select()
        .single());
    }

    if (error) throw error;
    return NextResponse.json({ job: data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save JD" }, { status: 500 });
  }
}
