import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function scoreApplication(
  jobDescription: string,
  answers: Record<string, string>
): Promise<{ score: number; summary: string; dimensions: Record<string, number> }> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are evaluating a job application for: ${jobDescription}

Candidate answers:
${Object.entries(answers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join("\n\n")}

Score this application from 1-100 and provide a brief summary. Evaluate:
1. Depth of experience (0-100)
2. Clarity of communication (0-100)
3. Ambition and drive (0-100)
4. AI/tech savviness (0-100)

Respond in JSON: { "score": number, "summary": string, "dimensions": { "depth": number, "clarity": number, "ambition": number, "ai_savviness": number } }`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
  return json;
}

export async function generateJobDescription(prompt: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Generate a compelling, detailed job description for a tech role based on this prompt: "${prompt}"

Include: role overview, key responsibilities (5-7 bullet points), requirements (must-have and nice-to-have), what makes this role exciting.

Format as clean markdown.`,
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

export async function generateAssessment(jobDescription: string): Promise<{ title: string; questions: Array<{ id: string; text: string; type: string }> }> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Create a technical assessment for this job: ${jobDescription}

Generate 5 substantive questions that assess real technical depth and AI usage. Questions should reveal how candidates think, not just what they know.

Respond in JSON: { "title": string, "questions": [{ "id": string, "text": string, "type": "text" }] }`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{"title":"Assessment","questions":[]}');
  return json;
}
