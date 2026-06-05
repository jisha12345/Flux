import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const { jobs } = await request.json();
    if (!Array.isArray(jobs)) return NextResponse.json({ error: "jobs must be an array" }, { status: 400 });

    const supabase = await createServerSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const records = jobs.map((j: Record<string, unknown>) => ({
      ...j,
      employer_id: session.user.id,
      source: "iimjobs",
      is_active: true,
    }));

    const { data, error } = await supabase.from("jobs").insert(records).select();
    if (error) throw error;
    return NextResponse.json({ imported: data?.length ?? 0 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
