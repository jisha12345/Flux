import Link from "next/link";
import {
  CalendarClock,
  ClipboardList,
  FileText,
  ListFilter,
  type LucideIcon,
} from "lucide-react";

const ACCENT = "#F26522";

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" />
  </svg>
);

/** Facts, not claims: each number is something the product actually does. */
const FACTS = [
  { value: "14", label: "questions in the application" },
  { value: "8", label: "competencies scored per interview" },
  { value: "6", label: "sections in a voice interview" },
];

const STAGES = [
  {
    step: "01",
    title: "Write the role",
    body: "Describe the role in the builder and edit the generated description, or paste one you already have.",
  },
  {
    step: "02",
    title: "Collect applications",
    body: "Candidates answer role-specific questions. Each submission is scored against the requirements for that role.",
  },
  {
    step: "03",
    title: "Run the first interview",
    body: "Candidates open a link and talk to an AI interviewer. Sections and follow-up questions come from the job description and their CV.",
  },
  {
    step: "04",
    title: "Review and decide",
    body: "Every interview produces a written assessment with scores, evidence from the transcript, and areas to probe in the next round.",
  },
];

const CAPABILITIES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: FileText,
    title: "Job descriptions",
    body: "Turn a short brief into a structured description with responsibilities, requirements, and skills you can edit before publishing.",
  },
  {
    icon: ListFilter,
    title: "Candidate database",
    body: "Every applicant is stored and searchable by skill, score, notice period, location, and current compensation.",
  },
  {
    icon: ClipboardList,
    title: "Screening tests",
    body: "Generate a timed test from the job description. Submissions are scored and flagged for tab switching and lost focus.",
  },
  {
    icon: CalendarClock,
    title: "Interview scheduling",
    body: "Book follow-up rounds against your Google Calendar, then attach the transcript for analysis when the call ends.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-[#14161a]">
      <header className="border-b border-[#e7e9ec]">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded"
              style={{ background: ACCENT }}
            >
              <ShieldIcon className="h-3.5 w-3.5 fill-white" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Reqr</span>
            <span className="hidden text-[13px] text-[#6b7280] sm:inline">by Shiprocket</span>
          </Link>
          <nav className="flex items-center gap-5 text-[14px]">
            <Link
              href="/tech"
              className="text-[#4b5563] transition-colors hover:text-[#14161a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F26522] focus-visible:ring-offset-2"
            >
              Open roles
            </Link>
            <Link
              href="/employer/login"
              className="text-[#4b5563] transition-colors hover:text-[#14161a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F26522] focus-visible:ring-offset-2"
            >
              Recruiter login
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5">
        {/* Hero */}
        <section className="border-b border-[#e7e9ec] py-16 sm:py-20">
          <h1 className="max-w-3xl text-[34px] font-semibold leading-[1.12] tracking-tight sm:text-[46px]">
            Screening for engineering roles, from application to assessment.
          </h1>
          <p className="mt-5 max-w-xl text-[17px] leading-[1.6] text-[#4b5563]">
            Reqr runs the first round of hiring at Shiprocket. Candidates apply
            with role-specific answers, sit a voice interview with an AI
            interviewer, and arrive at your review with a written assessment.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/apply"
              className="rounded-md px-5 py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F26522] focus-visible:ring-offset-2"
              style={{ background: ACCENT }}
            >
              Apply for a role
            </Link>
            <Link
              href="/tech"
              className="rounded-md border border-[#d5d8dd] px-5 py-2.5 text-[14px] font-medium text-[#14161a] transition-colors hover:border-[#9ca3af] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F26522] focus-visible:ring-offset-2"
            >
              See open roles
            </Link>
          </div>

          <dl className="mt-12 flex flex-wrap gap-x-12 gap-y-5">
            {FACTS.map((f) => (
              <div key={f.label}>
                <dt className="sr-only">{f.label}</dt>
                <dd>
                  <span className="text-[26px] font-semibold tabular-nums">{f.value}</span>
                  <span className="ml-2 text-[14px] text-[#6b7280]">{f.label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Pipeline */}
        <section className="border-b border-[#e7e9ec] py-16">
          <h2 className="text-[22px] font-semibold tracking-tight">
            How a role moves through Reqr
          </h2>
          <ol className="mt-8">
            {STAGES.map((s, i) => (
              <li
                key={s.step}
                className={`grid gap-x-6 gap-y-1.5 py-5 sm:grid-cols-[3rem_14rem_1fr] ${
                  i > 0 ? "border-t border-[#eef0f2]" : ""
                }`}
              >
                <span className="text-[13px] tabular-nums text-[#9ca3af]">{s.step}</span>
                <h3 className="text-[15px] font-medium">{s.title}</h3>
                <p className="max-w-2xl text-[15px] leading-[1.6] text-[#4b5563]">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Capabilities, with the interview given the most weight */}
        <section className="border-b border-[#e7e9ec] py-16">
          <h2 className="text-[22px] font-semibold tracking-tight">
            Manage the hiring process from role creation to offer
          </h2>

          <article className="mt-8 grid gap-x-12 gap-y-8 bg-[#f7f8f9] p-7 sm:p-9 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-[12px] font-medium uppercase tracking-wider text-[#6b7280]">
                First-round interview
              </p>
              <h3 className="mt-2.5 text-[24px] font-semibold leading-snug tracking-tight sm:text-[28px]">
                Every interview is planned from the job description and the CV
              </h3>
              <p className="mt-4 text-[15px] leading-[1.65] text-[#4b5563]">
                Before the call, Reqr reads both and plans six sections with
                specific areas to probe. During the call the interviewer follows
                the candidate&rsquo;s answers, asks follow-up questions, and
                keeps to the booked duration.
              </p>
              <p className="mt-3 text-[15px] leading-[1.65] text-[#4b5563]">
                Afterwards you get a written assessment: an overall score, eight
                competencies rated with evidence quoted from the transcript,
                strengths, open questions, and what the next interviewer should
                cover.
              </p>
            </div>

            <dl className="space-y-4 self-center text-[14px] lg:border-l lg:border-[#e2e5e8] lg:pl-10">
              {[
                { k: "Languages", v: "English and Hindi" },
                { k: "If the call drops", v: "Resumes at the last question" },
                { k: "Record kept", v: "Recording and transcript, both sides" },
                { k: "Identity", v: "Photo captured before the interview starts" },
              ].map(({ k, v }) => (
                <div key={k}>
                  <dt className="text-[#6b7280]">{k}</dt>
                  <dd className="mt-0.5 text-[#14161a]">{v}</dd>
                </div>
              ))}
            </dl>
          </article>

          <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-[#6b7280]" strokeWidth={1.75} aria-hidden="true" />
                  <h3 className="text-[15px] font-medium">{title}</h3>
                </div>
                <p className="mt-2 text-[15px] leading-[1.6] text-[#4b5563]">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Close */}
        <section className="py-16">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight">
                Start an application or open the dashboard
              </h2>
              <p className="mt-2 max-w-md text-[15px] leading-[1.6] text-[#4b5563]">
                Candidates apply in one sitting. Recruiters sign in to post
                roles and review completed interviews.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Link
                href="/apply"
                className="rounded-md px-5 py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F26522] focus-visible:ring-offset-2"
                style={{ background: ACCENT }}
              >
                Apply for a role
              </Link>
              <Link
                href="/employer/login"
                className="rounded-md border border-[#d5d8dd] px-5 py-2.5 text-[14px] font-medium text-[#14161a] transition-colors hover:border-[#9ca3af] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F26522] focus-visible:ring-offset-2"
              >
                Recruiter login
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#e7e9ec]">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-7 text-[13px] text-[#6b7280] sm:flex-row sm:items-center sm:justify-between">
          <span>Powered by Shiprocket</span>
          <span>Internal tool. Confidential.</span>
        </div>
      </footer>
    </div>
  );
}
