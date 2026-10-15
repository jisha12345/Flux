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
  // Clamp score and dimensions to 0-100
  if (json.score != null) json.score = Math.min(100, Math.max(0, Math.round(json.score)));
  if (json.dimensions) {
    for (const k of Object.keys(json.dimensions)) {
      json.dimensions[k] = Math.min(100, Math.max(0, Math.round(json.dimensions[k])));
    }
  }
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

export interface InterviewFeedbackResult {
  summary: string;
  competency_scores: Record<string, number>;
  strengths: string[];
  concerns: string[];
  recommendation: "Strong Hire" | "Hire" | "Hold" | "Reject";
  overall_score: number;
}

export async function processInterviewFeedback(
  rawNotes: string,
  role: string,
  round: string
): Promise<InterviewFeedbackResult> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: "You are an expert interview evaluator. Given raw bullet-point notes from an interviewer, extract structured evaluation data. Always return valid JSON matching the specified schema exactly.",
    messages: [
      {
        role: "user",
        content: `Analyze this ${round} interview feedback for a ${role} candidate:

<interview_notes>
${rawNotes}
</interview_notes>

Return a JSON object with exactly these fields:
{
  "summary": "2-3 sentence summary of the candidate's performance",
  "competency_scores": { "Communication": <1-10>, "Technical Skills": <1-10>, "Problem Solving": <1-10>, "Culture Fit": <1-10>, "Leadership": <1-10> },
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "concerns": ["concern 1"],
  "recommendation": "Strong Hire" | "Hire" | "Hold" | "Reject",
  "overall_score": <weighted average out of 10, one decimal>
}

Base the recommendation on: Strong Hire ≥8.5, Hire 7.0–8.4, Hold 5.5–6.9, Reject <5.5.
Return ONLY the JSON object.`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as InterviewFeedbackResult;
}

export async function generateAssessment(jobDescription: string): Promise<{ title: string; questions: Array<{ id: string; text: string; type: string }> }> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: `Create a technical assessment for this job: ${jobDescription}

Generate 5 substantive questions that assess technical depth and AI usage. Favour questions that surface how a candidate reasons through a problem, the trade-offs they weigh, and how they verify their work.

Respond in JSON: { "title": string, "questions": [{ "id": string, "text": string, "type": "text" }] }`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{"title":"Assessment","questions":[]}');
  return json;
}
