import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/claude";

export async function POST(req: NextRequest) {
  try {
    const { brief } = await req.json();

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `You are a talent acquisition expert at an AI-first company. Generate a compelling, modern job description based on this brief:

"${brief}"

The JD should feel energetic, honest, and attract people who love building with AI. Avoid corporate jargon.

Respond with ONLY valid JSON, no markdown:
{
  "title": "<job title>",
  "department": "<department>",
  "location": "<location>",
  "type": "<full-time|part-time|contract|internship>",
  "experience_range": "<e.g. 3-6 years>",
  "ctc_range": "<e.g. 20-35 LPA>",
  "about_role": "<3-4 engaging sentences about the role>",
  "responsibilities": ["<responsibility 1>", "..."],
  "requirements": ["<requirement 1>", "..."],
  "nice_to_have": ["<nice to have 1>", "..."],
  "ai_expectations": "<1-2 sentences on how AI is used in this role>"
}`,
        },
      ],
    });

    const text = (message.content[0] as { type: string; text: string }).text;
    const jd = JSON.parse(text);

    return NextResponse.json({ success: true, jd });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "JD generation failed" }, { status: 500 });
  }
}
