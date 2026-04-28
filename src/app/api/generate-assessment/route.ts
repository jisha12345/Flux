import { NextRequest, NextResponse } from "next/server";
import { getAnthropic } from "@/lib/claude";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { brief, role, department, type } = await req.json();
    if (!brief) return NextResponse.json({ error: "Brief is required" }, { status: 400 });

    const isTech = type === "tech" || /engineer|developer|data|ml|ai|devops|architect|backend|frontend|fullstack/i.test(role || "");
    const assessmentType = type || (isTech ? "tech" : "non-tech");

    const prompt = `You are a senior hiring manager at an AI-first Indian product company. Create a screening assessment for this role.

Role: ${role || "Not specified"}
Department: ${department || "Not specified"}
Brief: ${brief}
Type: ${assessmentType}

Generate a ${isTech ? "30" : "25"}-minute assessment with exactly this structure:

${isTech ? `
- 10 MCQ questions testing: algorithms/data structures (3), system design thinking (3), role-specific technical knowledge (3), AI/tools awareness (1)
- 1 coding/technical problem (describe the problem clearly, no actual code needed from candidate — a written solution approach)
- 2 situational/behavioral questions
` : `
- 8 MCQ questions testing: domain knowledge (4), situational judgment (2), analytical thinking (1), AI awareness (1)
- 3 written response questions (role-specific scenarios)
- 1 case study / scenario analysis
`}

Return ONLY valid JSON, no markdown:
{
  "title": "<Role> Screening Assessment",
  "assessment_type": "${assessmentType}",
  "time_limit_minutes": ${isTech ? 30 : 25},
  "questions": [
    {
      "id": 1,
      "type": "mcq",
      "section": "Technical Knowledge",
      "question": "<question text>",
      "options": ["A. <option>", "B. <option>", "C. <option>", "D. <option>"],
      "correct": "A",
      "points": 5,
      "explanation": "<why this is correct — shown after submission>"
    },
    {
      "id": 2,
      "type": "written",
      "section": "Situational",
      "question": "<question text>",
      "points": 15,
      "hint": "<optional hint for candidate>"
    }
  ]
}

Make questions specific to the actual role — not generic. Include at least one question about using AI in their day-to-day work.`;

    const message = await getAnthropic().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = (message.content[0] as { type: string; text: string }).text;
    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const assessment = JSON.parse(clean);

    const maxScore = assessment.questions.reduce((sum: number, q: { points: number }) => sum + q.points, 0);

    const { data, error } = await getSupabaseAdmin()
      .from("assessments")
      .insert([{
        title: assessment.title,
        role: role || "",
        department: department || "",
        assessment_type: assessment.assessment_type,
        questions: assessment.questions,
        time_limit_minutes: assessment.time_limit_minutes,
        jd_brief: brief,
        is_active: true,
      }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, assessment: { ...data, max_score: maxScore } });
  } catch (err) {
    console.error("Assessment generation error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
