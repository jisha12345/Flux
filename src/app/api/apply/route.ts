import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { scoreApplication } from "@/lib/claude";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, current_role, experience, skills, ...answers } = body;

    // Service role: applicants are anonymous, and reading the inserted row
    // back for its id needs a SELECT that anon must not have on candidates.
    const supabase = createServiceClient();

    // Get default JD for scoring if no job_id provided
    const jobDescription = `Engineering role at Shiprocket. We look for engineers who use AI tools in their daily work and have built systems at scale.`;

    const scoring = await scoreApplication(jobDescription, answers).catch(() => null);

    const { data, error } = await supabase
      .from("candidates")
      .insert({
        full_name: name,
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
