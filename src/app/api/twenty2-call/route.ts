import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { phone, candidate_name } = await request.json();

    const apiKey = process.env.TWENTY2_API_KEY;
    const callerPhone = process.env.TWENTY2_CALLER_PHONE;

    if (!apiKey) {
      return NextResponse.json({ error: "Twenty2 not configured" }, { status: 503 });
    }

    const res = await fetch("https://api.twentytwo.in/api/agent/trigger-outbound-call", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-workspace-id": "69b671241b2dacf0c0f15885",
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        agent_id: "69de483c68b23495c853b43a",
        callee_phone: phone,
        caller_phone: callerPhone ?? phone,
        input_parameters: {
          agentName: candidate_name,
        },
      }),
    });

    const data = await res.json();
    return NextResponse.json({ success: res.ok, call: data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to trigger call" }, { status: 500 });
  }
}
