import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function DELETE(req: NextRequest) {
  try {
    const { assessment_id } = await req.json();
    if (!assessment_id) return NextResponse.json({ error: "assessment_id required" }, { status: 400 });
    const { error } = await getSupabaseAdmin()
      .from("assessments")
      .update({ is_active: false })
      .eq("id", assessment_id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
