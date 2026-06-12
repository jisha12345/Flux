import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

function sanitizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, "").replace(/^\+91/, "").replace(/^0/, "");
}

export async function POST(request: NextRequest) {
  try {
    const { phone, candidate_name, job_id, cv_result } = await request.json();

    const apiKey = process.env.TWENTY2_API_KEY;
    const callerPhone = process.env.TWENTY2_CALLER_PHONE;

    if (!apiKey) return NextResponse.json({ error: "Twenty2 API key not configured" }, { status: 503 });
    if (!callerPhone) return NextResponse.json({ error: "Twenty2 caller phone not configured" }, { status: 503 });

    const calleePhone = sanitizePhone(phone);
    const callerPhoneSanitized = sanitizePhone(callerPhone);

    // If CV result provided, upsert a candidate record so the webhook can enrich it later
    if (cv_result) {
      try {
        const supabase = createServiceClient();
        const phoneVariants = [calleePhone, `+91${calleePhone}`];

        const { data: existing } = await supabase
          .from("candidates")
          .select("id, voice_screen")
          .or(phoneVariants.map(p => `phone.eq.${p}`).join(","))
          .maybeSingle();

        const voiceScreenPayload = {
          status: "pending",
          triggered_at: new Date().toISOString(),
          cv_result,
        };

        const candidatePayload = {
          full_name: cv_result.name ?? candidate_name,
          email: cv_result.email ?? `${calleePhone}@screened.reqr`,
          phone: `+91${calleePhone}`,
          current_role: cv_result.current_role ?? null,
          ai_score: cv_result.score ?? null,
          profile_summary: cv_result.summary ?? null,
          status: "new",
          voice_screen: voiceScreenPayload,
        };

        if (existing) {
          await supabase.from("candidates").update({
            voice_screen: voiceScreenPayload,
          }).eq("id", existing.id);
        } else {
          await supabase.from("candidates").insert({
            ...candidatePayload,
            job_id: job_id ?? null,
          });
        }
      } catch (dbErr) {
        console.error("Candidate upsert error (non-fatal):", dbErr);
      }
    }

    const body = {
      agent_id: "6a2bdea18444335418ddb603",
      callee_phone: calleePhone,
      caller_phone: callerPhoneSanitized,
      input_parameters: {
        agentName: candidate_name ?? "Candidate",
      },
    };

    console.log("Twenty2 request:", JSON.stringify(body));

    const res = await fetch("https://api.twentytwo.in/api/agent/trigger-outbound-call", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-workspace-id": "69b671241b2dacf0c0f15885",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    console.log("Twenty2 response:", res.status, JSON.stringify(data));

    if (!res.ok) {
      return NextResponse.json({ error: data?.error?.message ?? "Call failed", detail: data }, { status: res.status });
    }

    return NextResponse.json({ success: true, call: data });
  } catch (err) {
    console.error("Twenty2 error:", err);
    return NextResponse.json({ error: "Failed to trigger call" }, { status: 500 });
  }
}
