import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  try { return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)); }
  catch { return false; }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-twenty2-signature") ?? "";
  const secret = process.env.TWENTY2_WEBHOOK_SECRET;

  if (secret && (!signature || !verifySignature(rawBody, signature, secret))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let event: Record<string, unknown>;
  try { event = JSON.parse(rawBody); }
  catch { return new NextResponse("Invalid JSON", { status: 400 }); }

  if (event.event !== "call.completed") {
    return new NextResponse("OK", { status: 200 });
  }

  const call = event.call as Record<string, unknown>;
  const contact = event.contact as Record<string, unknown>;
  const outputVars = (event.output_variables ?? {}) as Record<string, string>;
  const recording = event.recording as Record<string, string> | undefined;
  const transcript = event.transcript as Record<string, string> | undefined;

  const calleePhone = String(contact?.to_number ?? "").replace(/^\+91/, "");
  const phoneVariants = [calleePhone, `+91${calleePhone}`];

  let transcriptText: string | null = null;
  if (transcript?.url) {
    try {
      const res = await fetch(transcript.url, { signal: AbortSignal.timeout(5000) });
      transcriptText = await res.text();
    } catch { /* non-blocking */ }
  }

  const supabase = createServiceClient();

  // Fetch existing candidate to get the stored CV result
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, voice_screen, profile_summary, ai_score, full_name")
    .or(phoneVariants.map(p => `phone.eq.${p}`).join(","))
    .maybeSingle();

  const cvResult = (candidate?.voice_screen as Record<string, unknown> | null)?.cv_result as Record<string, unknown> | null;

  // Generate AI combined summary if we have a transcript
  let aiSummary: Record<string, unknown> | null = null;
  if (transcriptText && transcriptText.length > 50) {
    try {
      const cvContext = cvResult
        ? `CV Score: ${cvResult.score}/100\nCV Summary: ${cvResult.summary}\nStrengths: ${(cvResult.strengths as string[])?.join(", ")}\nGaps: ${(cvResult.gaps as string[])?.join(", ")}`
        : candidate?.profile_summary
          ? `CV Summary: ${candidate.profile_summary}\nCV Score: ${candidate.ai_score ?? "N/A"}`
          : "No CV data available.";

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `You are a senior recruiter. Analyse this candidate's telephonic screening call and combine it with their CV data.

CV DATA:
${cvContext}

CALL TRANSCRIPT:
${transcriptText.slice(0, 3000)}

CALL OUTPUT VARIABLES:
${JSON.stringify(outputVars)}

Respond with ONLY a JSON object:
{
  "combined_score": <0-100, weighted average of CV fit and call performance>,
  "recommendation": "Strong yes" | "Yes" | "Maybe" | "No",
  "call_summary": "2-3 sentences on how the candidate performed on the call",
  "cv_vs_call": "1 sentence on how the call aligned with or diverged from the CV",
  "highlights": ["key point 1", "key point 2"],
  "red_flags": ["flag 1"] or [],
  "next_step": "Specific recommended next action"
}`,
        }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      aiSummary = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    } catch (e) {
      console.error("AI summary generation failed:", e);
    }
  }

  const voiceScreenData = {
    status: "completed",
    call_id: call.call_id,
    duration_seconds: call.duration_seconds,
    started_at: call.started_at,
    ended_at: call.ended_at,
    output_variables: outputVars,
    recording_url: recording?.url ?? null,
    transcript_url: transcript?.url ?? null,
    transcript_text: transcriptText,
    ai_summary: aiSummary,
    cv_result: cvResult,
    completed_at: new Date().toISOString(),
  };

  const updatePayload: Record<string, unknown> = {
    voice_screen: voiceScreenData,
  };

  if (aiSummary?.combined_score) updatePayload.score = aiSummary.combined_score;
  if (outputVars.interested === "yes") updatePayload.status = "Shortlisted";

  if (candidate) {
    await supabase.from("candidates").update(updatePayload).eq("id", candidate.id);
  } else {
    // No candidate found — create one
    await supabase.from("candidates").insert({
      phone: `+91${calleePhone}`,
      email: `${calleePhone}@screened.reqr`,
      full_name: String(contact?.to_number ?? calleePhone),
      status: "new",
      voice_screen: voiceScreenData,
    });
  }

  // Log to twenty2_calls if table exists
  supabase.from("twenty2_calls").insert({
    call_id: call.call_id,
    callee_phone: contact?.to_number,
    caller_phone: contact?.from_number,
    duration_seconds: call.duration_seconds,
    transcript_text: transcriptText,
    ai_summary: aiSummary,
    output_variables: outputVars,
  }).then(() => null, () => null);

  return new NextResponse("OK", { status: 200 });
}
