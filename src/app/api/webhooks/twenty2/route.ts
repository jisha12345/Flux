import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase";

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-twenty2-signature") ?? "";
  const secret = process.env.TWENTY2_WEBHOOK_SECRET;

  if (secret) {
    if (!signature || !verifySignature(rawBody, signature, secret)) {
      return new NextResponse("Invalid signature", { status: 401 });
    }
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  if (event.event !== "call.completed") {
    return new NextResponse("OK", { status: 200 });
  }

  const call = event.call as Record<string, unknown>;
  const contact = event.contact as Record<string, unknown>;
  const outputVars = (event.output_variables ?? {}) as Record<string, string>;
  const recording = event.recording as Record<string, string> | undefined;
  const transcript = event.transcript as Record<string, string> | undefined;

  const calleePhone = String(contact?.to_number ?? "").replace(/^\+91/, "");

  // Fetch transcript text if available
  let transcriptText: string | null = null;
  if (transcript?.url) {
    try {
      const res = await fetch(transcript.url, { signal: AbortSignal.timeout(4000) });
      transcriptText = await res.text();
    } catch {
      // non-blocking — store URL instead
    }
  }

  const voiceScreenData = {
    call_id: call.call_id,
    status: call.status,
    duration_seconds: call.duration_seconds,
    cost: call.cost,
    started_at: call.started_at,
    ended_at: call.ended_at,
    output_variables: outputVars,
    recording_url: recording?.url ?? null,
    recording_expires_at: recording?.expires_at ?? null,
    transcript_url: transcript?.url ?? null,
    transcript_text: transcriptText,
    screened_at: new Date().toISOString(),
  };

  const supabase = createServiceClient();

  // Update candidate matched by phone number
  const { error } = await supabase
    .from("candidates")
    .update({
      voice_screen: voiceScreenData,
      // Promote to Shortlisted if output variables indicate interest
      ...(outputVars.interested === "yes" ? { status: "Shortlisted" } : {}),
    })
    .or(`phone.eq.${calleePhone},phone.eq.+91${calleePhone}`);

  if (error) {
    console.error("Failed to update candidate:", error);
  }

  // Also log to a twenty2_calls table if it exists
  supabase.from("twenty2_calls").insert({
    ...voiceScreenData,
    callee_phone: contact?.to_number,
    caller_phone: contact?.from_number,
    input_variables: event.input_variables,
  }).then(() => null, () => null);

  return new NextResponse("OK", { status: 200 });
}
