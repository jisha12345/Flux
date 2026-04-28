import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { data, error } = await getSupabaseAdmin()
      .from("job_descriptions")
      .insert([{
        title: body.title,
        department: body.department,
        location: body.location,
        type: body.type,
        experience_range: body.experience_range,
        ctc_range: body.ctc_range,
        about_role: body.about_role,
        responsibilities: body.responsibilities,
        requirements: body.requirements,
        nice_to_have: body.nice_to_have,
        ai_expectations: body.ai_expectations,
        is_active: true,
      }])
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, jd: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("job_descriptions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });
  return NextResponse.json({ success: true, jds: data });
}
