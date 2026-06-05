import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/claude";

export async function POST(request: NextRequest) {
  try {
    const { url, text } = await request.json();

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `Extract structured profile data from this ${url ? "LinkedIn/portfolio URL content" : "profile text"}:

${text || url}

Return JSON with: { name, email, phone, current_role, current_company, experience_years, skills: string[], linkedin_url, github_url, summary }`,
      }],
    });

    const content = response.content[0].type === "text" ? response.content[0].text : "";
    const profile = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    return NextResponse.json({ profile });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to parse profile" }, { status: 500 });
  }
}
