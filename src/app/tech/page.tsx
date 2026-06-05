"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const SKILLS = [
  "ReactJS", "AngularJS", "JavaScript", "TypeScript", "Python", "Node.js", "Go", "Rust", "Java",
  "Kotlin", "Swift", "Flutter", "React Native", "iOS", "Android", "Bootstrap", "Tailwind CSS",
  "Vue.js", "Next.js", "GraphQL", "REST API", "AWS", "GCP", "Azure", "Docker", "Kubernetes",
  "CI/CD", "PostgreSQL", "MongoDB", "Redis", "Kafka", "Machine Learning", "Gen AI", "LLMs",
  "Data Engineering", "DevOps", "UI/UX", "Figma", "Product Management",
];

const SKILLS2 = [...SKILLS].reverse();

const EMPLOYERS = [
  "Shiprocket", "Razorpay", "Zepto", "Meesho", "CRED", "Groww",
  "Postman", "HashEdIn", "ThoughtWorks", "Nagarro",
];

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
  <svg viewBox="0 0 24 24" className={className}>
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
    const matchesFilter = filter === "All" || j.skills?.some((s) => s.toLowerCase().includes(filter.toLowerCase()));
    const matchesSearch = !search || j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.company?.toLowerCase().includes(search.toLowerCase()) ||
      j.skills?.some((s) => s.toLowerCase().includes(search.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-white text-[#1A202C]">
      <style>{`
        @keyframes marquee-forward {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes marquee-reverse {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        .job-card:hover { box-shadow: 0 8px 30px rgba(26,111,196,0.12); transform: translateY(-1px); }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-[#E4E9F0]" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: "#F26522" }}>
              <ShieldIcon className="w-4 h-4 fill-white" />
            </div>
            <span className="font-black text-[#17305A] text-lg tracking-tight">
              REQR<span style={{ color: "#F26522" }}>.TECH</span>
            </span>
          </Link>
          <div className="hidden sm:flex items-center gap-1 ml-4 text-[11px] text-gray-400 font-medium uppercase tracking-widest">
            Handpicked Premium Tech Jobs
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/employer/dashboard" className="text-sm text-[#1A6FC4] hover:underline font-medium">
              Employer →
            </Link>
            <Link href="/apply" className="px-4 py-2 bg-[#17305A] hover:bg-[#1A3D6B] text-white text-sm font-semibold rounded-lg transition-all">
              Apply Now
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-[#17305A] via-[#1A3D6B] to-[#1A6FC4] pt-16 pb-12 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-5">
          <div className="space-y-2">
            <h1 className="text-5xl sm:text-7xl font-black tracking-tight text-white leading-none">
              REQR<span style={{ color: "#F26522" }}>.TECH</span>
            </h1>
            <p className="text-white/60 text-sm font-medium uppercase tracking-[0.2em]">by Shiprocket</p>
          </div>
          <div className="max-w-xl mx-auto mt-6">
            <div className="relative">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search jobs — React, Python, DevOps, location..."
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white text-[#1A202C] placeholder-gray-400 outline-none text-sm shadow-xl focus:ring-2"
                style={{ "--tw-ring-color": "rgba(242,101,34,0.4)" } as React.CSSProperties}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Marquee skill tags */}
      <div className="bg-[#F8FAFC] border-b border-[#E4E9F0] py-3 space-y-2.5 overflow-hidden">
        <div className="overflow-hidden whitespace-nowrap">
          <div className="inline-flex gap-3" style={{ animation: "marquee-forward 40s linear infinite" }}>
            {[...SKILLS, ...SKILLS].map((s, i) => (
              <span
                key={`${s}-${i}`}
                onClick={() => { setFilter(s); setSearch(""); }}
                className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer transition-all hover:scale-105"
                style={{ background: "rgba(26,111,196,0.08)", borderColor: "rgba(26,111,196,0.2)", color: "#1A6FC4" }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-hidden whitespace-nowrap">
          <div className="inline-flex gap-3" style={{ animation: "marquee-reverse 45s linear infinite" }}>
            {[...SKILLS2, ...SKILLS2].map((s, i) => (
              <span
                key={`${s}-r-${i}`}
                onClick={() => { setFilter(s); setSearch(""); }}
                className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer transition-all hover:scale-105"
                style={{ background: "rgba(242,101,34,0.06)", borderColor: "rgba(242,101,34,0.2)", color: "#F26522" }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Filter pills */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-4 py-1.5 rounded-full text-sm font-medium border transition-all"
            style={filter === f
              ? { background: "#1A6FC4", borderColor: "#1A6FC4", color: "white" }
              : { background: "white", borderColor: "#E4E9F0", color: "#64748b" }
            }
          >
            {f}
          </button>
        ))}
      </div>

      {/* Job listings */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-sm">No roles found. Check back soon.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((job) => (
              <div
                key={job.id}
                className="job-card bg-white rounded-2xl p-5 border border-[#E4E9F0] transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-lg bg-[#F8FAFC] border border-[#E4E9F0] flex items-center justify-center shrink-0">
                        <ShieldIcon className="w-4 h-4 fill-[#17305A]" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-[#17305A] text-sm">{job.title}</h3>
                        <p className="text-xs text-gray-400">{job.company ?? "Shiprocket"}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {job.skills?.slice(0, 6).map((s) => (
                        <span
                          key={s}
                          className="px-2.5 py-1 rounded-full text-xs font-medium border"
                          style={{ background: "rgba(26,111,196,0.06)", borderColor: "rgba(26,111,196,0.15)", color: "#1A6FC4" }}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Link href={`/apply?job=${job.id}`} className="shrink-0">
                    <Button size="sm" className="text-white font-semibold text-xs px-4" style={{ background: "#17305A" }}>
                      Apply
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Hiring companies */}
        <section className="mt-16 pt-10 border-t border-gray-100">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-4">Hiring from this platform</p>
          <div className="flex flex-wrap gap-2">
            {EMPLOYERS.map((e) => (
              <span key={e} className="px-3 py-1.5 border border-gray-200 rounded-full text-sm text-gray-500 hover:border-gray-300 transition-colors cursor-default">{e}</span>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
