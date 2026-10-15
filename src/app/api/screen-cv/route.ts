import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabaseClient } from "@/lib/supabase";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYSIS_PROMPT = (jobContext: string, cvText: string) => `You are a senior technical recruiter screening a CV against a job description.

JOB DESCRIPTION:
${jobContext}

CANDIDATE CV:
${cvText}

Evaluate this candidate and respond with ONLY a JSON object, no preamble:
{
  "name": "candidate full name",
  "email": "email if found or null",
  "phone": "phone if found or null",
  "current_role": "current job title and company",
  "score": <0-100 overall fit>,
  "summary": "2-3 sentence recruiter summary vs this role",
  "dimensions": {
    "technical_depth": <0-100>,
    "ai_fluency": <0-100>,
    "experience_relevance": <0-100>,
    "impact_clarity": <0-100>,
    "growth_trajectory": <0-100>
  },
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "gaps": ["gap 1", "gap 2"],
  "recommendation": "Strong yes" | "Yes" | "Maybe" | "No"
}

impact_clarity: score how well the CV demonstrates measurable outcomes and ownership (quantified achievements, scope of projects, promotions).`;

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
      // Single call — pass PDF document block directly into analysis prompt
      response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
            } as Anthropic.DocumentBlockParam,
            { type: "text", text: ANALYSIS_PROMPT(jobContext, "[see attached CV document above]") },
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
        max_tokens: 1024,
        messages: [{ role: "user", content: ANALYSIS_PROMPT(jobContext, cvText) }],
      });
    }

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const result = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

    return NextResponse.json({ result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "CV screening failed" }, { status: 500 });
  }
}
