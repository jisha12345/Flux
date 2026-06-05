import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { scoreApplication } from "@/lib/claude";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, current_role, experience, skills, ...answers } = body;

    const supabase = await createServerSupabaseClient();

    // Get default JD for scoring if no job_id provided
    const jobDescription = `Tech role at Shiprocket — looking for engineers who deeply use AI and build at scale.`;

    const scoring = await scoreApplication(jobDescription, answers).catch(() => null);

    const { data, error } = await supabase
      .from("candidates")
      .insert({
        name,
        email,
        phone,
        current_role,
        experience_years: parseInt(experience) || null,
        skills: skills ? skills.split(",").map((s: string) => s.trim()) : [],
        answers,
        ai_score: scoring?.score ?? null,
        ai_summary: scoring?.summary ?? null,
        ai_dimensions: scoring?.dimensions ?? null,
        status: "Applied",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to submit application" }, { status: 500 });
  }
}
