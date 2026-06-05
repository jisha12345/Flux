import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { generateAssessment } from "@/lib/claude";

export async function POST(request: NextRequest) {
  try {
    const { job_id, job_description } = await request.json();
    const assessment = await generateAssessment(job_description);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("assessments")
      .insert({ job_id, title: assessment.title, questions: assessment.questions })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ assessment: data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to generate assessment" }, { status: 500 });
  }
}
