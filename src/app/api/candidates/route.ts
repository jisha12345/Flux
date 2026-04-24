import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const minScore = searchParams.get("min_score") || "0";
  const status = searchParams.get("status");
  const location = searchParams.get("location");
  const wfh = searchParams.get("wfh");
  const notice = searchParams.get("notice");
  const maxCtc = searchParams.get("max_expected_ctc");
  const search = searchParams.get("search");

  const admin = getSupabaseAdmin();
  let query = admin
    .from("candidates")
    .select("*")
    .gte("score", parseInt(minScore))
    .order("score", { ascending: false });

  if (status) query = query.eq("status", status);
  if (location) query = query.ilike("current_location", `%${location}%`);
  if (wfh) query = query.eq("wfh_preference", wfh);
  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,current_role.ilike.%${search}%,current_company.ilike.%${search}%,ai_tools_used.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ candidates: data });
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json();
  const { error } = await getSupabaseAdmin()
    .from("candidates")
    .update({ status })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
