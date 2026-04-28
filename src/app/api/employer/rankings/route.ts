import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const sb = getSupabaseAdmin();

    const [{ data: candidates }, { data: responses }, { data: assessments }] = await Promise.all([
      sb.from("candidates").select("*").order("score", { ascending: false }),
      sb.from("assessment_responses").select("*").order("submitted_at", { ascending: false }),
      sb.from("assessments").select("id,title,role,department,jd_content,jd_brief").order("created_at", { ascending: false }),
    ]);

    // email -> latest response
    const responseByEmail = new Map<string, Record<string, unknown>>();
    for (const r of (responses || [])) {
      const email = (r.candidate_email as string)?.toLowerCase();
      if (email && !responseByEmail.has(email)) responseByEmail.set(email, r as Record<string, unknown>);
    }

    const ranked = (candidates || []).map(c => {
      const response = responseByEmail.get((c.email as string)?.toLowerCase() || "") || null;
      const profileScore = (c.score as number) || 0;
      const assessmentScore = response ? (response.score as number) || 0 : null;
      const combinedScore = assessmentScore !== null
        ? Math.round(profileScore * 0.4 + assessmentScore * 0.6)
        : profileScore;
      const assessment = assessments?.find(a => a.id === (response?.assessment_id as string)) || null;

      return { candidate: c, response, assessment, profile_score: profileScore, assessment_score: assessmentScore, combined_score: combinedScore };
    });

    // candidates with assessment first, then by combined score
    ranked.sort((a, b) => {
      if ((a.assessment_score !== null) !== (b.assessment_score !== null)) return a.assessment_score !== null ? -1 : 1;
      return b.combined_score - a.combined_score;
    });

    return NextResponse.json({ success: true, rankings: ranked, assessments: assessments || [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
