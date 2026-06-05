import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/claude";
import { createServerSupabaseClient } from "@/lib/supabase";

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
    const base64 = buffer.toString("base64");

    const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
    const isDocx = file.name.toLowerCase().endsWith(".docx") ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    let cvText = "";

    if (isPdf) {
      const docBlock: Anthropic.DocumentBlockParam = {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      };
      const textBlock: Anthropic.TextBlockParam = {
        type: "text",
        text: "Extract all text from this CV/resume document. Return only the raw extracted text.",
      };
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: [docBlock, textBlock] }],
      });
      cvText = response.content[0].type === "text" ? response.content[0].text : "";
    } else if (isDocx) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      cvText = result.value;
    } else {
      // Try to read as text
      cvText = buffer.toString("utf-8");
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `You are a senior technical recruiter screening a CV against a job description.

JOB DESCRIPTION:
${jobContext}

CANDIDATE CV:
${cvText}

Evaluate this candidate and respond with a JSON object:
{
  "name": "candidate full name",
  "email": "email if found",
  "phone": "phone if found",
  "current_role": "current job title and company",
  "score": <0-100 overall fit score>,
  "summary": "2-3 sentence recruiter summary of the candidate vs this role",
  "dimensions": {
    "technical_depth": <0-100>,
    "ai_fluency": <0-100>,
    "experience_relevance": <0-100>,
    "communication": <0-100>,
    "growth_trajectory": <0-100>
  },
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "gaps": ["gap 1", "gap 2"],
  "recommendation": "Strong yes" | "Yes" | "Maybe" | "No"
}`,
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const result = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

    return NextResponse.json({ result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "CV screening failed" }, { status: 500 });
  }
}
