import { CandidateApplication, ScoreBreakdown } from "./types";

export async function sendApplicationNotification(
  candidate: CandidateApplication,
  score: number | null,
  breakdown: ScoreBreakdown | null
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const scoreColor = score && score >= 75 ? "#22c55e" : score && score >= 50 ? "#f59e0b" : "#6366f1";
  const scoreLabel = score && score >= 75 ? "Strong fit" : score && score >= 50 ? "Good potential" : "On file";

  const row = (label: string, val: string | undefined) =>
    val ? `<tr><td style="color:#71717a;font-size:12px;padding:6px 12px 6px 0;white-space:nowrap">${label}</td><td style="color:#ffffff;font-size:13px;padding:6px 0">${val}</td></tr>` : "";

  const section = (title: string, content: string | undefined) =>
    content ? `<div style="margin-top:20px"><p style="color:#52525b;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px">${title}</p><p style="color:#d4d4d8;font-size:14px;line-height:1.6;margin:0">${content}</p></div>` : "";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="background:#09090b;margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:0 auto">

    <!-- Header -->
    <div style="margin-bottom:24px">
      <span style="font-size:20px;font-weight:900;background:linear-gradient(135deg,#fff,#a78bfa,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Flux</span>
      <span style="color:#3f3f46;margin-left:8px;font-size:12px">New application</span>
    </div>

    <!-- Candidate header -->
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px 24px;margin-bottom:16px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">
        <div>
          <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 4px">${candidate.full_name}</h1>
          <p style="color:#a1a1aa;font-size:14px;margin:0 0 2px">${candidate.current_role} · ${candidate.current_company}</p>
          <p style="color:#52525b;font-size:12px;margin:0">${candidate.email} · ${candidate.phone}</p>
        </div>
        ${score !== null ? `<div style="text-align:center;flex-shrink:0">
          <div style="width:52px;height:52px;border-radius:50%;border:2.5px solid ${scoreColor};display:flex;align-items:center;justify-content:center">
            <span style="color:${scoreColor};font-size:16px;font-weight:700">${score}</span>
          </div>
          <p style="color:${scoreColor};font-size:10px;margin:4px 0 0;white-space:nowrap">${scoreLabel}</p>
        </div>` : ""}
      </div>
    </div>

    <!-- Key facts -->
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:16px 24px;margin-bottom:16px">
      <table style="width:100%;border-collapse:collapse">
        ${row("Current CTC", candidate.current_ctc)}
        ${row("Expected CTC", candidate.expected_ctc)}
        ${row("Notice Period", candidate.notice_period)}
        ${row("Experience", candidate.total_experience ? `${candidate.total_experience} years` : undefined)}
        ${row("Location", candidate.current_location)}
        ${row("Open to", candidate.preferred_location)}
        ${row("Work mode", candidate.wfh_preference)}
        ${row("AI comfort", candidate.ai_comfort_score ? `${candidate.ai_comfort_score}/10` : undefined)}
      </table>
    </div>

    <!-- Score breakdown -->
    ${breakdown ? `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px 24px;margin-bottom:16px">
      <p style="color:#52525b;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px">AI Score Breakdown</p>
      ${[
        { label: "AI Depth", val: breakdown.ai_depth, max: 25 },
        { label: "Communication", val: breakdown.communication, max: 25 },
        { label: "Experience", val: breakdown.experience_relevance, max: 25 },
        { label: "Ambition", val: breakdown.ambition, max: 25 },
      ].map(item => `<div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="color:#a1a1aa;font-size:12px">${item.label}</span>
          <span style="color:#52525b;font-size:12px">${item.val}/${item.max}</span>
        </div>
        <div style="height:4px;background:#27272a;border-radius:4px">
          <div style="height:4px;width:${Math.round((item.val / item.max) * 100)}%;background:linear-gradient(90deg,#7c3aed,#2563eb);border-radius:4px"></div>
        </div>
      </div>`).join("")}
      <p style="color:#a1a1aa;font-size:13px;line-height:1.6;margin:12px 0 0;padding-top:12px;border-top:1px solid rgba(255,255,255,0.05)">${breakdown.summary}</p>
    </div>` : ""}

    <!-- AI answers -->
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px 24px;margin-bottom:16px">
      <p style="color:#52525b;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 4px">AI answers</p>
      ${section("Tools they use", candidate.ai_tools_used)}
      ${section("What they built with AI", candidate.ai_project_built)}
      ${section("AI vision for the role", candidate.ai_future_vision)}
      ${section("Without AI", candidate.ai_without_tools_feeling)}
      ${section("Biggest build", candidate.biggest_build)}
      ${section("Why us", candidate.why_us)}
    </div>

    <!-- Links + CTA -->
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px">
      ${candidate.linkedin_url ? `<a href="${candidate.linkedin_url}" style="color:#93c5fd;font-size:13px;text-decoration:none;border:1px solid rgba(255,255,255,0.08);padding:8px 16px;border-radius:10px">LinkedIn ↗</a>` : ""}
      ${candidate.github_url ? `<a href="${candidate.github_url}" style="color:#a1a1aa;font-size:13px;text-decoration:none;border:1px solid rgba(255,255,255,0.08);padding:8px 16px;border-radius:10px">GitHub ↗</a>` : ""}
      ${candidate.portfolio_url ? `<a href="${candidate.portfolio_url}" style="color:#a1a1aa;font-size:13px;text-decoration:none;border:1px solid rgba(255,255,255,0.08);padding:8px 16px;border-radius:10px">Portfolio ↗</a>` : ""}
      <a href="https://flux-swart-five.vercel.app/employer/dashboard" style="color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;background:linear-gradient(135deg,#7c3aed,#2563eb);padding:8px 20px;border-radius:10px">View in Dashboard →</a>
    </div>

    <p style="color:#3f3f46;font-size:11px">Sent by Flux · <a href="https://flux-swart-five.vercel.app" style="color:#52525b">flux-swart-five.vercel.app</a></p>
  </div>
</body>
</html>`;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Flux <onboarding@resend.dev>",
        to: ["jisha.bawa@shiprocket.com"],
        subject: `New application — ${candidate.full_name} · ${candidate.current_role} @ ${candidate.current_company}${score ? ` · Score ${score}` : ""}`,
        html,
      }),
    });
  } catch (err) {
    console.error("Email send failed (non-fatal):", err);
  }
}
