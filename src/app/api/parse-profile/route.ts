import { NextRequest, NextResponse } from "next/server";
import { getAnthropic } from "@/lib/claude";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { text, source = "manual" } = await req.json();
    if (!text?.trim()) return NextResponse.json({ error: "Profile text is required" }, { status: 400 });

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const prompt = `You are a recruiting assistant. Extract candidate information from this profile text copied from a job portal (Naukri, iimjobs, LinkedIn, or any source).

Profile text:
${text}

Return ONLY valid JSON with these exact fields (use null if not available):
{
  "full_name": "",
  "email": null,
  "phone": null,
  "current_role": "",
  "current_company": "",
  "company_type": "product|service|startup|logistics|mnc",
  "industry": "",
  "functional_area": "Product Management|Technology|Data Science & Analytics|Marketing & Growth|Design|Sales & Business Development|Operations|Finance|HR",
  "total_experience": "",
  "experience_years": 0,
  "previous_companies": "",
  "current_location": "",
  "preferred_location": "",
  "highest_qualification": "",
  "college": "",
  "graduation_year": "",
  "tier": "Tier 1|Tier 2|Tier 3",
  "key_skills": "",
  "profile_summary": "",
  "linkedin_url": null,
  "current_ctc": null,
  "expected_ctc": null,
  "notice_period": null,
  "wfh_preference": "hybrid",
  "ai_tools_used": null,
  "ai_comfort_score": null
}`;

    const message = await getAnthropic().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = (message.content[0] as { type: string; text: string }).text;
    const cleanText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleanText);

    // Score the profile
    const scorePrompt = `Score this candidate for an AI-first product/logistics company from 0-100.
Profile: ${JSON.stringify(parsed, null, 2)}
Return ONLY valid JSON, no markdown: { "ai_depth": <0-25>, "communication": <0-25>, "experience_relevance": <0-25>, "ambition": <0-25>, "total": <0-100>, "summary": "<2 sentences>" }`;

    const scoreMsg = await getAnthropic().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [{ role: "user", content: scorePrompt }],
    });

    const rawScore = (scoreMsg.content[0] as { type: string; text: string }).text;
    const cleanScore = rawScore.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const breakdown = JSON.parse(cleanScore);

    const { data: candidate, error } = await getSupabaseAdmin()
      .from("candidates")
      .insert([{ ...parsed, score: breakdown.total, score_breakdown: breakdown, status: "new", source }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, candidate });
  } catch (err) {
    console.error("Parse profile error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
