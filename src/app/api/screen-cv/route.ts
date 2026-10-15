import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYSIS_PROMPT = (jobContext: string, cvText: string) => `You are a senior recruiter at a fast-growing Indian startup screening a CV against a job description.

SCORING RULES (read carefully before scoring):
- Score 80-100: Strong match — role, skills, and experience directly align. Recommend "Strong yes" or "Yes".
- Score 60-79: Decent match — most requirements met, minor gaps. Recommend "Yes" or "Maybe".
- Score 40-59: Partial match — some relevant experience but clear gaps. Recommend "Maybe".
- Score 0-39: Poor match — role or skills significantly misaligned. Recommend "No".
- Do NOT score down for missing AI tool mentions unless the JD explicitly requires AI skills.
- Score based on what IS present in the CV, not on hypothetical missing items.

JOB DESCRIPTION:
${jobContext}

CANDIDATE CV:
${cvText}

Respond with ONLY a JSON object — no preamble, no trailing text:
{
  "name": "candidate full name",
  "email": "email if found or null",
  "phone": "phone if found or null",
  "current_role": "current job title and company",
  "score": <0-100 per scoring rules above>,
  "summary": "2-3 sentence honest recruiter assessment — what makes them a fit or not for THIS specific role",
  "dimensions": {
    "skills_match": <0-100, how well their skills match JD requirements>,
    "experience_relevance": <0-100, years and type of experience vs JD>,
    "impact_clarity": <0-100, measurable outcomes, ownership, promotions in CV>,
    "company_calibre": <0-100, quality and scale of companies worked at>,
    "growth_trajectory": <0-100, career progression signals>
  },
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "gaps": ["gap 1", "gap 2"],
  "recommendation": "Strong yes" | "Yes" | "Maybe" | "No"
}`;

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("cv") as File | null;
    const jobId = form.get("job_id") as string | null;

    if (!file || !jobId) {
      return NextResponse.json({ error: "Missing cv or job_id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: job } = await supabase.from("jobs").select("title, description").eq("id", jobId).single();
    const jobContext = job ? `${job.title}\n\n${job.description ?? ""}` : "Senior tech role";

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
    const isDocx = file.name.toLowerCase().endsWith(".docx") ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    let response: Anthropic.Message;

    if (isPdf) {
      // Single call: embed PDF directly — no pre-extraction round trip
      response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 900,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
            } as Anthropic.DocumentBlockParam,
            { type: "text", text: ANALYSIS_PROMPT(jobContext, "[see attached CV above]") },
          ],
        }],
      });
    } else {
      let cvText = "";
      if (isDocx) {
        const mammoth = await import("mammoth");
        cvText = (await mammoth.extractRawText({ buffer })).value;
      } else {
        cvText = buffer.toString("utf-8");
      }
      response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 900,
        messages: [{ role: "user", content: ANALYSIS_PROMPT(jobContext, cvText) }],
      });
    }

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const result = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

    // Persist screened candidate to Supabase
    try {
      const service = createServiceClient();
      const email = result.email ?? null;
      const phone = result.phone
        ? result.phone.replace(/\D/g, "").slice(-10)
        : null;

      // Check for existing candidate by email or phone
      let existing = null;
      if (email) {
        const { data } = await service.from("candidates").select("id").eq("email", email).maybeSingle();
        existing = data;
      }
      if (!existing && phone) {
        const { data } = await service.from("candidates").select("id")
          .or(`phone.eq.${phone},phone.eq.+91${phone}`).maybeSingle();
        existing = data;
      }

      const payload = {
        full_name: result.name ?? null,
        email: email ?? `screened-${Date.now()}@screened.reqr`,
        phone: phone ? `+91${phone}` : null,
        current_role: result.current_role ?? null,
        ai_score: result.score ?? null,
        profile_summary: result.summary ?? null,
        job_id: jobId,
        status: "new",
      };

      if (existing) {
        // Only overwrite name/email if the CV provides them — never null out existing data
        const updatePayload: Record<string, unknown> = {
          current_role: result.current_role ?? null,
          ai_score: result.score ?? null,
          profile_summary: result.summary ?? null,
          job_id: jobId,
        };
        if (result.name) updatePayload.full_name = result.name;
        if (email) updatePayload.email = email;
        if (phone) updatePayload.phone = `+91${phone}`;
        await service.from("candidates").update(updatePayload).eq("id", existing.id);
      } else {
        await service.from("candidates").insert(payload);
      }
    } catch (dbErr) {
      console.error("Candidate save error (non-fatal):", dbErr);
    }

    return NextResponse.json({ result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "CV screening failed" }, { status: 500 });
  }
}
