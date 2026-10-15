import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Noto_Serif } from "next/font/google";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase";
import {
  HYR,
  type AiInterviewRow,
  type InterviewStatus,
} from "@/lib/interview-types";
import ReportView from "./report-view";
import "./report.css";

const notoSerif = Noto_Serif({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-noto-serif",
});

export const metadata: Metadata = {
  title: "Reqr Interview Results: Candidate Assessment",
  robots: { index: false },
};

/** Single source of truth for the report palette (src/lib/interview-types.ts),
 *  exposed to report.css as --hyr-* custom properties. */
const hyrVars = {
  "--hyr-primary": HYR.primaryDark,
  "--hyr-banner": HYR.banner,
  "--hyr-mint": HYR.mint,
  "--hyr-mint-faint": HYR.mintFaint,
  "--hyr-hairline": HYR.mintBorder,
  "--hyr-cream": HYR.cream,
  "--hyr-amber": HYR.amber,
  "--hyr-body": HYR.body,
  "--hyr-muted": HYR.muted,
  "--hyr-footer": HYR.footer,
} as CSSProperties;

const STATUS_LABEL: Record<InterviewStatus, string> = {
  pending: "Interview not yet started",
  in_progress: "Interview in progress",
  completed: "Evaluation in progress",
  evaluated: "Evaluation in progress",
  expired: "Interview link expired",
  error: "Evaluation failed",
};

/** Statuses that can still produce a report — worth auto-refreshing for. */
const WAITING: InterviewStatus[] = ["pending", "in_progress", "completed", "evaluated"];

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className={`${notoSerif.variable} hyr-root min-h-screen bg-zinc-100`} style={hyrVars}>
      {children}
    </div>
  );
}

function StateCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div
        className="w-full max-w-md border bg-white p-8 text-center"
        style={{ borderColor: HYR.mintBorder }}
      >
        <p
          className="text-sm font-bold"
          style={{
            fontFamily: "var(--font-noto-serif), Georgia, serif",
            color: HYR.primaryDark,
          }}
        >
          Reqr Interview Results
        </p>
        {children}
      </div>
    </div>
  );
}

function NotFoundState() {
  return (
    <Shell>
      <StateCard>
        <h1 className="mt-4 text-xl font-semibold text-zinc-900">Report not found</h1>
        <p className="mt-2 text-sm text-zinc-600">
          This interview doesn&rsquo;t exist or is no longer available.
        </p>
        <Link
          href="/employer/dashboard?tab=ai"
          className="mt-6 inline-block text-sm font-medium underline underline-offset-4"
          style={{ color: HYR.primaryDark }}
        >
          Back to dashboard
        </Link>
      </StateCard>
    </Shell>
  );
}

function PendingState({ row }: { row: AiInterviewRow }) {
  const waiting = WAITING.includes(row.status);
  return (
    <Shell>
      {/* React 19 hoists this into <head>: light-touch auto-refresh while we
          wait for the evaluation pipeline to write the report. */}
      {waiting ? <meta httpEquiv="refresh" content="20" /> : null}
      <StateCard>
        <div className="mt-5">
          <span
            className="inline-flex items-center gap-2 px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
            style={
              waiting
                ? { background: HYR.mint, color: HYR.primaryDark }
                : { background: HYR.cream, color: HYR.amber }
            }
          >
            {waiting ? (
              <span
                className="hyr-pulse inline-block h-2 w-2"
                style={{ background: HYR.banner }}
                aria-hidden="true"
              />
            ) : null}
            {STATUS_LABEL[row.status] ?? "Evaluation in progress"}
          </span>
        </div>
        <h1 className="mt-4 text-xl font-semibold text-zinc-900">{row.candidate_name}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {row.role_title} &middot; {row.company_name}
        </p>
        <p className="mt-4 text-sm text-zinc-600">
          {waiting
            ? "The assessment report hasn't been generated yet. This page refreshes automatically every 20 seconds."
            : "No assessment report is available for this interview."}
        </p>
        <Link
          href="/employer/dashboard?tab=ai"
          className="mt-6 inline-block text-sm font-medium underline underline-offset-4"
          style={{ color: HYR.primaryDark }}
        >
          Back to dashboard
        </Link>
      </StateCard>
    </Shell>
  );
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/employer/login");

  const service = createServiceClient();
  const { data, error } = await service
    .from("ai_interviews")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // A malformed id makes Postgres error on the uuid cast — treat as not found.
  const row = (error ? null : data) as AiInterviewRow | null;

  if (!row) return <NotFoundState />;
  if (!row.report) return <PendingState row={row} />;

  return (
    <Shell>
      <ReportView
        row={row}
        report={row.report}
        recordingUrl={row.video_path ? `/api/ai-interviews/${row.id}/recording` : null}
      />
    </Shell>
  );
}
