import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import type { InterviewReport } from "@/lib/interview-types";

// ── Helpers ─────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function str(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.filter(Boolean).map(String).join(", ");
  return String(v).trim();
}

/** "Label: value" line, or null when the value is empty. */
function line(label: string, v: unknown): string | null {
  const text = str(v);
  return text ? `${label}: ${text}` : null;
}

/** "Label:\n<block>" section — arrays become "- " bullets. Null when empty. */
function block(label: string, v: unknown): string | null {
  if (v == null) return null;
  const text = Array.isArray(v)
    ? v.filter(Boolean).map((item) => `- ${String(item).trim()}`).join("\n")
    : String(v).trim();
  return text ? `${label}:\n${text}` : null;
}

function synthesizeCvText(c: Row): string {
  return [
    line("Name", c.full_name ?? c.name),
    line("Current role", [c.current_role, c.current_company].filter(Boolean).join(" at ")),
    line("Total experience", c.total_experience ?? c.experience_years),
    line("Key skills", c.key_skills),
    line("Previous companies", c.previous_companies),
    line("Highest qualification", c.highest_qualification),
    line("College", c.college),
    block("Profile summary", c.profile_summary),
  ]
    .filter(Boolean)
    .join("\n");
}

function synthesizeJdText(jd: Row): string {
  return [
    line("Role", jd.title),
    block("About the role", jd.about_role ?? jd.description),
    block("Responsibilities", jd.responsibilities),
    block("Requirements", jd.requirements),
    line("Key skills", jd.key_skills ?? jd.skills),
    block("AI expectations", jd.ai_expectations),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function inviteEmailHtml(opts: {
  candidateName: string;
  roleTitle: string;
  durationMinutes: number;
  interviewUrl: string;
}): string {
  const firstName = opts.candidateName.split(/\s+/)[0] || "there";
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1f2937;">
  <p style="font-size:15px;line-height:1.6;">Hi ${firstName},</p>
  <p style="font-size:15px;line-height:1.6;">
    You've been invited to an AI-powered interview with <strong>Shiprocket</strong> for the role of
    <strong>${opts.roleTitle}</strong>. It takes about <strong>${opts.durationMinutes} minutes</strong>
    and you can do it whenever you're ready.
  </p>
  <p style="margin:28px 0;text-align:center;">
    <a href="${opts.interviewUrl}"
       style="display:inline-block;background:#F26522;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;">
      Start your interview
    </a>
  </p>
  <p style="font-size:13px;line-height:1.6;color:#6b7280;">
    If the button doesn't work, copy this link into your browser:<br/>
    <a href="${opts.interviewUrl}" style="color:#F26522;word-break:break-all;">${opts.interviewUrl}</a>
  </p>
  <p style="font-size:14px;line-height:1.6;margin-top:24px;"><strong>A few tips before you start:</strong></p>
  <ul style="font-size:14px;line-height:1.8;color:#374151;padding-left:20px;margin-top:4px;">
    <li>Find a quiet room where you won't be interrupted.</li>
    <li>Use Google Chrome on a laptop or desktop.</li>
    <li>Allow camera and microphone access when prompted.</li>
  </ul>
  <p style="font-size:14px;line-height:1.6;margin-top:24px;">Good luck!<br/>— Reqr by Shiprocket</p>
</div>`.trim();
}

// ── POST: create an interview + shareable link ──────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    candidate_id?: string;
    jd_id?: string;
    candidate_name?: string;
    candidate_email?: string;
    role_title?: string;
    language?: string;
    duration_minutes?: number;
    jd_text?: string;
    cv_text?: string;
    send_email?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const service = createServiceClient();

  let candidateName = str(body.candidate_name);
  let candidateEmail = str(body.candidate_email) || null;
  let roleTitle = str(body.role_title);
  let cvText = str(body.cv_text) || null;
  let jdText = str(body.jd_text) || null;
  let jdId: string | null = body.jd_id ?? null;

  // Enrich from the candidate row when a candidate_id is given
  if (body.candidate_id) {
    const { data: candidate } = await service
      .from("candidates")
      .select("*")
      .eq("id", body.candidate_id)
      .maybeSingle();
    if (candidate) {
      const c = candidate as Row;
      if (!candidateName) candidateName = str(c.full_name ?? c.name);
      if (!candidateEmail) candidateEmail = str(c.email) || null;
      if (!cvText) cvText = synthesizeCvText(c) || null;
    }
  }

  // Enrich from the JD row when a jd_id is given
  if (jdId && !jdText) {
    const { data: jd } = await service
      .from("job_descriptions")
      .select("*")
      .eq("id", jdId)
      .maybeSingle();
    if (jd) {
      const j = jd as Row;
      jdText = synthesizeJdText(j) || null;
      if (!roleTitle) roleTitle = str(j.title);
    } else {
      // The dashboard's JD picker is backed by the `jobs` table — fall back to
      // it, but drop jd_id so the ai_interviews FK (→ job_descriptions) holds.
      const { data: job } = await service.from("jobs").select("*").eq("id", jdId).maybeSingle();
      jdId = null;
      if (job) {
        const j = job as Row;
        jdText = synthesizeJdText(j) || null;
        if (!roleTitle) roleTitle = str(j.title);
      }
    }
  }

  if (!candidateName) return NextResponse.json({ error: "candidate_name is required" }, { status: 400 });
  if (!roleTitle) return NextResponse.json({ error: "role_title is required" }, { status: 400 });

  const token = randomBytes(18).toString("base64url");

  const { data: interview, error } = await service
    .from("ai_interviews")
    .insert({
      token,
      candidate_id: body.candidate_id ?? null,
      jd_id: jdId,
      candidate_name: candidateName,
      candidate_email: candidateEmail,
      role_title: roleTitle,
      company_name: "Shiprocket",
      language: body.language ?? "en-IN",
      duration_minutes: body.duration_minutes ?? 30,
      jd_text: jdText,
      cv_text: cvText,
      status: "pending",
      created_by: session.user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const interviewUrl = `${appUrl.replace(/\/$/, "")}/interview/${token}`;

  let emailSent = false;
  if (body.send_email && candidateEmail) {
    try {
      await sendEmail({
        to: candidateEmail,
        subject: `Your AI interview with Shiprocket — ${roleTitle}`,
        html: inviteEmailHtml({
          candidateName,
          roleTitle,
          durationMinutes: body.duration_minutes ?? 30,
          interviewUrl,
        }),
      });
      emailSent = !!process.env.SMTP_USER;
    } catch (err) {
      console.error("AI interview invite email failed:", err);
      emailSent = false;
    }
  }

  return NextResponse.json({ interview, interview_url: interviewUrl, email_sent: emailSent });
}

// ── GET: list interviews (report flattened to score + verdict) ──────────────

interface ListRow {
  id: string;
  token: string;
  candidate_name: string;
  candidate_email: string | null;
  role_title: string;
  language: string;
  duration_minutes: number;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  video_path: string | null;
  report_generated_at: string | null;
  created_at: string;
  report: InterviewReport | null;
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const service = createServiceClient();
  let query = service
    .from("ai_interviews")
    .select(
      "id, token, candidate_name, candidate_email, role_title, language, duration_minutes, status, started_at, ended_at, video_path, report_generated_at, created_at, report"
    )
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const interviews = ((data ?? []) as unknown as ListRow[]).map(({ report, ...rest }) => ({
    ...rest,
    overall_percent: report?.overall_percent ?? null,
    verdict: report?.verdict ?? null,
  }));

  return NextResponse.json({ interviews });
}
