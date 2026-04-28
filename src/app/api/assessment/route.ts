import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAnthropic } from "@/lib/claude";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await getSupabaseAdmin()
    .from("assessments")
    .select("id, title, role, department, assessment_type, time_limit_minutes, questions, is_active")
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (error || !data) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });

  // Strip correct answers before sending to candidate
  const sanitised = {
    ...data,
    questions: (data.questions as Array<Record<string, unknown>>).map(({ correct, explanation, ...q }) => {
      void correct; void explanation;
      return q;
    }),
  };

  return NextResponse.json({ success: true, assessment: sanitised });
}

export async function POST(req: NextRequest) {
  try {
    const { assessment_id, candidate_name, candidate_email, answers, time_taken_seconds } = await req.json();
    if (!assessment_id || !answers) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const { data: assessment } = await getSupabaseAdmin()
      .from("assessments")
      .select("questions, title, role")
      .eq("id", assessment_id)
      .single();

    if (!assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });

    const questions = assessment.questions as Array<Record<string, unknown>>;
    let score = 0;
    const maxScore = questions.reduce((s: number, q: Record<string, unknown>) => s + (q.points as number), 0);
    const breakdown: Record<string, unknown>[] = [];

    // Auto-score MCQ
    for (const q of questions) {
      if (q.type === "mcq") {
        const submitted = answers.find((a: { id: unknown }) => a.id === q.id);
        const correct = submitted?.answer === q.correct;
        const pts = correct ? (q.points as number) : 0;
        score += pts;
        breakdown.push({ id: q.id, type: "mcq", correct, points_earned: pts, max_points: q.points, correct_answer: q.correct, explanation: q.explanation });
      }
    }

    // Score written answers with Claude
    const writtenQs = questions.filter(q => q.type === "written" || q.type === "coding");
    if (writtenQs.length > 0 && process.env.ANTHROPIC_API_KEY) {
      const writtenAnswers = writtenQs.map(q => {
        const submitted = answers.find((a: { id: unknown }) => a.id === q.id);
        return { question: q.question, answer: submitted?.answer || "", max_points: q.points };
      });

      const scorePrompt = `You are evaluating screening test answers for a ${assessment.role} role.

Score each written answer out of its max points. Be fair but rigorous.

${writtenAnswers.map((w, i) => `Q${i + 1} (max ${w.max_points} pts): ${w.question}\nAnswer: ${w.answer || "(no answer provided)"}`).join("\n\n")}

Return ONLY valid JSON array:
[{"index": 0, "points_earned": <number>, "feedback": "<1 sentence>"}]`;

      try {
        const msg = await getAnthropic().messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 512,
          messages: [{ role: "user", content: scorePrompt }],
        });
        const text = (msg.content[0] as { type: string; text: string }).text;
        const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
        const scores = JSON.parse(clean) as Array<{ index: number; points_earned: number; feedback: string }>;

        scores.forEach((s, i) => {
          const q = writtenQs[i];
          score += s.points_earned;
          breakdown.push({ id: q.id, type: q.type, points_earned: s.points_earned, max_points: q.points, feedback: s.feedback });
        });
      } catch { /* written scoring failed — MCQ score only */ }
    }

    const percentScore = Math.round((score / maxScore) * 100);

    const { data: response, error } = await getSupabaseAdmin()
      .from("assessment_responses")
      .insert([{
        assessment_id,
        candidate_name,
        candidate_email,
        answers,
        score: percentScore,
        max_score: maxScore,
        score_breakdown: breakdown,
        time_taken_seconds,
      }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, score: percentScore, max_score: maxScore, breakdown, response_id: response.id });
  } catch (err) {
    console.error("Assessment submit error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
