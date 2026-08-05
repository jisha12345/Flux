import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase";
import type { AiInterviewRow } from "@/lib/interview-types";
import InterviewClient from "./interview-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Interview · Hyr",
  robots: { index: false, follow: false },
};

/** Static dark shell for the non-interactive states (invalid / completed / expired). */
function StateScreen({
  title,
  body,
  tone = "neutral",
}: {
  title: string;
  body: string;
  tone?: "neutral" | "done";
}) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-[#0B1210] px-5 py-8 text-zinc-100 antialiased">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(52,211,153,0.07), transparent 65%)",
        }}
      />
      <header className="relative mx-auto flex w-full max-w-4xl items-baseline gap-3">
        <span className="text-xl font-semibold tracking-tight text-emerald-400">
          Hyr
        </span>
        <span className="h-4 w-px self-center bg-white/15" aria-hidden />
        <span className="text-sm text-zinc-400">AI Interview</span>
      </header>
      <main className="relative flex flex-1 items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <div
            className={
              tone === "done"
                ? "mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-400"
                : "mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-zinc-300"
            }
          >
            {tone === "done" ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
                <path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M12 8v4.5M12 15.5v.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-zinc-100 [text-wrap:balance]">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">{body}</p>
        </div>
      </main>
      <footer className="relative pt-4 text-center text-xs text-zinc-500">
        Powered by Hyr
      </footer>
    </div>
  );
}

export default async function InterviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const service = createServiceClient();
  const { data } = await service
    .from("ai_interviews")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  const interview = (data as AiInterviewRow | null) ?? null;

  if (!interview) {
    return (
      <StateScreen
        title="This interview link is invalid"
        body="We couldn't find an interview for this link. Double-check the link from your invitation email, or contact the hiring team for a new one."
      />
    );
  }

  if (interview.status === "completed" || interview.status === "evaluated") {
    return (
      <StateScreen
        tone="done"
        title="This interview has already been completed"
        body={`Your interview for ${interview.role_title} at ${interview.company_name} has been submitted. The hiring team will be in touch.`}
      />
    );
  }

  if (interview.status === "expired") {
    return (
      <StateScreen
        title="This interview link has expired"
        body={`This link for the ${interview.role_title} interview at ${interview.company_name} is no longer active. Reach out to the hiring team to request a fresh link.`}
      />
    );
  }

  if (interview.status === "error") {
    return (
      <StateScreen
        title="Something went wrong with this interview"
        body="This interview hit a technical problem and can't continue on this link. Please contact the hiring team, who can send you a new invitation."
      />
    );
  }

  // status: 'pending' | 'in_progress' — safe props only, never the full row.
  return (
    <InterviewClient
      token={interview.token}
      candidateName={interview.candidate_name}
      roleTitle={interview.role_title}
      company={interview.company_name}
      language={interview.language}
      durationMinutes={interview.duration_minutes}
      status={interview.status}
    />
  );
}
