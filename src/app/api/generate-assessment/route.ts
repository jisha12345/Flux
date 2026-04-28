import { NextRequest, NextResponse } from "next/server";
import { getAnthropic } from "@/lib/claude";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { brief, role, department, type, jd_content } = await req.json();
    if (!brief) return NextResponse.json({ error: "Brief is required" }, { status: 400 });

    const isTech = type === "tech" || /engineer|developer|data|ml|ai|devops|architect|backend|frontend|fullstack/i.test(role || "");
    const assessmentType = type || (isTech ? "tech" : "non-tech");

    const prompt = `You are a senior hiring manager at an AI-first Indian product company. Create a concise screening assessment for this role.

Role: ${role || "Not specified"}
Department: ${department || "Not specified"}
Brief: ${brief}
Type: ${assessmentType}

Generate a 10-12 minute assessment with exactly this structure:

${isTech ? `
- 7 MCQ questions testing: role-specific technical knowledge (4), system design thinking (2), AI/tools awareness (1)
- 1 coding/technical problem (written approach only, no actual code required)
- 1 situational/behavioral question
` : `
- 6 MCQ questions testing: domain knowledge (3), situational judgment (2), AI awareness (1)
- 2 written response questions (role-specific scenarios, 2-3 sentences expected)
- 1 short case study
`}

Keep questions sharp and specific to the role. No filler. Each written question should be answerable in 2-4 sentences.

Return ONLY valid JSON, no markdown:
{
  "title": "<Role> Screening Test",
  "assessment_type": "${assessmentType}",
  "time_limit_minutes": ${isTech ? 12 : 10},
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
        jd_content: jd_content || null,
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
