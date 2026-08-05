"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

const ACCENT = "#F26522";

const FILTERS = ["All", "ReactJS", "Python", "Node.js", "DevOps", "Java", "ML", "UI/UX", "Go", "Kotlin"];

interface Job {
  id: string;
  title: string;
  company?: string;
  skills?: string[];
  created_at: string;
  location?: string;
}

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" />
  </svg>
);

export default function TechPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/jd?active=true")
      .then((r) => r.json())
      .then((data) => setJobs(data.jobs ?? []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = jobs.filter((j) => {
    const matchesFilter =
      filter === "All" || j.skills?.some((s) => s.toLowerCase().includes(filter.toLowerCase()));
    const matchesSearch =
      !search ||
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.company?.toLowerCase().includes(search.toLowerCase()) ||
      j.skills?.some((s) => s.toLowerCase().includes(search.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-white text-[#14161a]">
      <header className="border-b border-[#e7e9ec]">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-5">
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
          <Link
            href="/employer/login"
            className="text-[14px] text-[#4b5563] transition-colors hover:text-[#14161a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F26522] focus-visible:ring-offset-2"
          >
            Recruiter login
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5">
        <section className="border-b border-[#e7e9ec] py-12">
          <h1 className="text-[30px] font-semibold leading-tight tracking-tight sm:text-[36px]">
            Open engineering roles
          </h1>
          <p className="mt-3 max-w-lg text-[16px] leading-[1.6] text-[#4b5563]">
            Every role here is hiring now. Applying takes one sitting and starts
            with questions about your work.
          </p>

          <div className="relative mt-7 max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, company, or skill"
              aria-label="Search roles"
              className="w-full rounded-md border border-[#d5d8dd] py-2.5 pl-9 pr-3 text-[14px] outline-none transition-colors placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus-visible:ring-2 focus-visible:ring-[#F26522] focus-visible:ring-offset-1"
            />
          </div>
        </section>

        <div className="flex flex-wrap gap-2 py-5" role="group" aria-label="Filter by skill">
          {FILTERS.map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={active}
                className={`rounded-md border px-3 py-1.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F26522] focus-visible:ring-offset-1 ${
                  active
                    ? "border-[#14161a] bg-[#14161a] font-medium text-white"
                    : "border-[#d5d8dd] text-[#4b5563] hover:border-[#9ca3af]"
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>

        <section className="pb-20" aria-live="polite">
          {loading ? (
            <div className="space-y-px border-t border-[#eef0f2]">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[76px] animate-pulse border-b border-[#eef0f2] bg-[#fafbfb]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="border-t border-[#eef0f2] py-14 text-[15px] text-[#6b7280]">
              {jobs.length === 0
                ? "No roles are open right now."
                : "No roles match that search."}
            </p>
          ) : (
            <ul className="border-t border-[#eef0f2]">
              {filtered.map((job) => (
                <li
                  key={job.id}
                  className="flex flex-col gap-3 border-b border-[#eef0f2] py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                >
                  <div className="min-w-0">
                    <h2 className="text-[16px] font-medium leading-snug">{job.title}</h2>
                    <p className="mt-1 text-[14px] text-[#6b7280]">
                      {job.company ?? "Shiprocket"}
                      {job.location ? ` · ${job.location}` : ""}
                    </p>
                    {job.skills && job.skills.length > 0 && (
                      <p className="mt-1.5 truncate text-[13px] text-[#6b7280]">
                        {job.skills.slice(0, 6).join(" · ")}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/apply?job=${job.id}`}
                    className="shrink-0 self-start rounded-md border border-[#d5d8dd] px-4 py-2 text-[14px] font-medium transition-colors hover:border-[#9ca3af] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F26522] focus-visible:ring-offset-2 sm:self-auto"
                  >
                    Apply
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
