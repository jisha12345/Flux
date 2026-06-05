"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

const SHIPROCKET_ORANGE = "#F26522";
const DARK_NAVY = "#1A2340";

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" />
  </svg>
);

function AnimatedSection({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
          el.style.opacity = "1";
          el.style.transform = "translateY(0)";
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ opacity: 0, transform: "translateY(20px)" }} className={className}>
      {children}
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "#F4F5F7", color: "#1C1C2E" }}>
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: SHIPROCKET_ORANGE }}>
              <ShieldIcon className="w-4 h-4 fill-white" />
            </div>
            <span className="font-bold text-xl text-gray-900">Reqr</span>
            <span className="text-xs text-gray-400 hidden sm:block">by Shiprocket</span>
          </Link>
          <div className="hidden sm:flex items-center gap-3">
            <Link href="/apply" className="px-5 py-2 text-white text-sm font-semibold rounded-lg transition-all" style={{ background: SHIPROCKET_ORANGE }}>
              Apply now
            </Link>
            <Link href="/employer/login" className="px-5 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all">
              Recruiter login
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-36 pb-24 px-4 sm:px-6 max-w-6xl mx-auto text-center">
        <AnimatedSection className="space-y-6">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium"
            style={{ borderColor: "rgba(242,101,34,0.3)", background: "rgba(242,101,34,0.08)", color: SHIPROCKET_ORANGE }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: SHIPROCKET_ORANGE }} />
            AI-powered hiring platform
          </div>
          <h1 className="text-5xl sm:text-7xl font-bold leading-[1.05] tracking-tight text-gray-900">
            <span className="gradient-text">Hiring for</span>
            <br />
            <span>the AI era.</span>
          </h1>
          <p className="text-gray-500 text-lg sm:text-xl max-w-xl mx-auto leading-relaxed">
            Show us what you&apos;ve built.
            <br className="hidden sm:block" />
            <span className="text-gray-900 font-medium">We&apos;ll take it from there.</span>
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link
              href="/apply"
              className="px-8 py-3.5 text-white font-semibold rounded-xl transition-all text-sm shadow-lg"
              style={{ background: SHIPROCKET_ORANGE, boxShadow: "0 4px 20px rgba(242,101,34,0.3)" }}
            >
              Apply in 5 minutes →
            </Link>
            <Link
              href="/employer/login"
              className="px-8 py-3.5 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl text-sm hover:border-gray-300 transition-all"
            >
              I&apos;m a recruiter
            </Link>
          </div>
        </AnimatedSection>

        <AnimatedSection className="mt-16 grid grid-cols-3 gap-4 sm:gap-8 max-w-lg mx-auto">
          {[
            { value: "5 min", label: "to apply" },
            { value: "AI", label: "scores every CV" },
            { value: "0", label: "fluff questions" },
          ].map((s) => (
            <div key={s.label} className="space-y-1">
              <p className="text-2xl sm:text-3xl font-bold gradient-text">{s.value}</p>
              <p className="text-gray-400 text-xs sm:text-sm">{s.label}</p>
            </div>
          ))}
        </AnimatedSection>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <AnimatedSection className="text-center mb-12">
          <p className="text-gray-400 text-sm uppercase tracking-widest mb-3">How it works</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Three steps. No fluff.</h2>
        </AnimatedSection>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { n: "01", title: "Apply in minutes", desc: "Answer real questions about what you've built. No resume spam." },
            { n: "02", title: "Get scored by AI", desc: "Claude evaluates your AI depth, clarity, and ambition in real-time." },
            { n: "03", title: "Hear back fast", desc: "Recruiters see your score and profile. No black hole." },
          ].map((s) => (
            <AnimatedSection key={s.n} className="bg-white rounded-2xl p-6 space-y-3 border border-gray-200 hover:shadow-md transition-shadow">
              <span className="text-4xl font-bold gradient-text">{s.n}</span>
              <h3 className="text-gray-900 font-semibold text-lg">{s.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
            </AnimatedSection>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <AnimatedSection className="text-center mb-12">
          <p className="text-gray-400 text-sm uppercase tracking-widest mb-3">Features</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Everything in one place.</h2>
        </AnimatedSection>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: "⚡", title: "AI-scored applications", desc: "Every candidate is scored across AI depth, communication, and ambition. No more gut-feel shortlisting." },
            { icon: "🧠", title: "Built for AI-native talent", desc: "Questions that reveal how candidates actually use AI — not just if they've heard of ChatGPT." },
            { icon: "🎯", title: "AI-generated JDs", desc: "Describe the role in plain English. Reqr writes a compelling, structured JD in seconds." },
            { icon: "🔍", title: "Candidate database", desc: "Every applicant is stored, scored, and searchable. Filter by CTC, notice, WFH, score, and more." },
            { icon: "📱", title: "Apply in minutes", desc: "Conversational form. One question at a time. No uploads required to start." },
            { icon: "🚀", title: "Pipeline management", desc: "Move candidates from Applied → Shortlisted → Interview → Offer without leaving the app." },
          ].map((f) => (
            <AnimatedSection key={f.title} className="bg-white rounded-2xl p-6 space-y-3 border border-gray-200 hover:shadow-md transition-shadow">
              <span className="text-2xl">{f.icon}</span>
              <h3 className="text-gray-900 font-semibold">{f.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
            </AnimatedSection>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <AnimatedSection>
          <div
            className="rounded-3xl p-10 sm:p-16 text-center space-y-6 relative overflow-hidden text-white"
            style={{ background: DARK_NAVY }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: "radial-gradient(circle at 70% 50%, rgba(242,101,34,0.15) 0%, transparent 60%)" }}
            />
            <h2 className="text-3xl sm:text-5xl font-bold relative z-10">
              Ready to find your next<br />
              <span className="gradient-text">great hire?</span>
            </h2>
            <p className="text-white/60 max-w-md mx-auto relative z-10">
              Whether you&apos;re a candidate or a recruiter — Reqr has you covered.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center relative z-10">
              <Link href="/apply" className="px-8 py-3.5 text-white font-semibold rounded-xl text-sm transition-all" style={{ background: SHIPROCKET_ORANGE }}>
                Apply now →
              </Link>
              <Link href="/employer/login" className="px-8 py-3.5 border border-white/20 text-white/80 font-medium rounded-xl text-sm hover:border-white/40 transition-all">
                Post a job
              </Link>
            </div>
          </div>
        </AnimatedSection>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: SHIPROCKET_ORANGE }}>
              <ShieldIcon className="w-3.5 h-3.5 fill-white" />
            </div>
            <span className="text-gray-500 text-sm">
              Powered by <span className="text-gray-700 font-medium">Shiprocket</span>
            </span>
          </div>
          <p className="text-gray-400 text-xs">Internal tool — confidential</p>
        </div>
      </footer>
    </div>
  );
}
