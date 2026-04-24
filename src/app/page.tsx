"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useState } from "react";

const FEATURES = [
  { icon: "⚡", title: "AI-scored applications", desc: "Every candidate is scored across AI depth, communication, and ambition. No more gut-feel shortlisting." },
  { icon: "🧠", title: "Built for AI-native talent", desc: "Questions that reveal how candidates actually use AI — not just if they've heard of ChatGPT." },
  { icon: "🎯", title: "AI-generated JDs", desc: "Describe the role in plain English. Flux writes a compelling, structured JD in seconds." },
  { icon: "🔍", title: "Candidate database", desc: "Every applicant is stored, scored, and searchable. Filter by CTC, notice, WFH, score, and more." },
  { icon: "📱", title: "Apply in minutes", desc: "Conversational form. One question at a time. No uploads required to start." },
  { icon: "🚀", title: "Pipeline management", desc: "Move candidates from Applied → Shortlisted → Interview → Offer without leaving the app." },
];

const STEPS = [
  { num: "01", title: "Apply in minutes", desc: "Answer real questions about what you've built. No resume spam." },
  { num: "02", title: "Get scored by AI", desc: "Claude evaluates your AI depth, clarity, and ambition in real-time." },
  { num: "03", title: "Hear back fast", desc: "Recruiters see your score and profile. No black hole." },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="glow-orb absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="glow-orb absolute top-[40%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-[100px]" style={{ animationDelay: "2s" }} />
        <div className="glow-orb absolute bottom-[-10%] left-[30%] w-[400px] h-[400px] rounded-full bg-indigo-600/8 blur-[80px]" style={{ animationDelay: "4s" }} />
      </div>

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 backdrop-blur-xl bg-black/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-2xl font-black tracking-tight gradient-text drop-shadow-lg">Flux</Link>
          <div className="hidden sm:flex items-center gap-3">
            <Link href="/apply" className="px-5 py-2 bg-white text-black text-sm font-semibold rounded-full hover:bg-zinc-100 transition-all">
              Apply now
            </Link>
            <Link href="/employer/login" className="px-5 py-2 border border-zinc-700 text-zinc-300 text-sm font-medium rounded-full hover:border-zinc-500 hover:text-white transition-all">
              Recruiter login
            </Link>
          </div>
          <button className="sm:hidden p-2 text-zinc-400 hover:text-white transition-colors" onClick={() => setMenuOpen(!menuOpen)}>
            <div className="space-y-1.5">
              <span className={`block w-6 h-0.5 bg-current transition-all duration-300 origin-center ${menuOpen ? "rotate-45 translate-y-2" : ""}`} />
              <span className={`block w-6 h-0.5 bg-current transition-all duration-300 ${menuOpen ? "opacity-0" : ""}`} />
              <span className={`block w-6 h-0.5 bg-current transition-all duration-300 origin-center ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
            </div>
          </button>
        </div>
        {menuOpen && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="sm:hidden border-t border-white/5 bg-black/95 px-4 py-4 flex flex-col gap-3">
            <Link href="/apply" onClick={() => setMenuOpen(false)}
              className="w-full py-3 bg-white text-black text-sm font-semibold rounded-xl text-center">Apply now →</Link>
            <Link href="/employer/login" onClick={() => setMenuOpen(false)}
              className="w-full py-3 border border-zinc-700 text-zinc-300 text-sm font-medium rounded-xl text-center">Recruiter login</Link>
          </motion.div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-36 pb-24 px-4 sm:px-6 max-w-6xl mx-auto text-center">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            AI-powered hiring platform
          </div>
          <h1 className="text-5xl sm:text-7xl font-bold leading-[1.05] tracking-tight">
            <span className="gradient-text">Hiring for</span><br />
            <span className="text-white">the AI era.</span>
          </h1>
          <p className="text-zinc-400 text-lg sm:text-xl max-w-xl mx-auto leading-relaxed">
            Degrees don&apos;t ship products. <span className="text-white font-medium">Builders do.</span><br className="hidden sm:block" />
            Show us what you&apos;ve made — <span className="text-white font-medium">we&apos;ll take it from there.</span>
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link href="/apply" className="px-8 py-3.5 bg-white text-black font-semibold rounded-full hover:bg-zinc-100 transition-all text-sm shadow-lg shadow-white/10">
              Apply in 5 minutes →
            </Link>
            <Link href="/employer/login" className="px-8 py-3.5 glass glass-hover text-zinc-300 font-medium rounded-full text-sm">
              I&apos;m a recruiter
            </Link>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-16 grid grid-cols-3 gap-4 sm:gap-8 max-w-lg mx-auto">
          {[{ val: "5 min", label: "to apply" }, { val: "AI", label: "scores every CV" }, { val: "0", label: "fluff questions" }].map((stat) => (
            <div key={stat.label} className="space-y-1">
              <p className="text-2xl sm:text-3xl font-bold gradient-text">{stat.val}</p>
              <p className="text-zinc-500 text-xs sm:text-sm">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
          <p className="text-zinc-500 text-sm uppercase tracking-widest mb-3">How it works</p>
          <h2 className="text-3xl sm:text-4xl font-bold">Three steps. No fluff.</h2>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {STEPS.map((step, i) => (
            <motion.div key={step.num} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.1 }} className="glass glass-hover rounded-2xl p-6 space-y-3">
              <span className="text-4xl font-bold gradient-text">{step.num}</span>
              <h3 className="text-white font-semibold text-lg">{step.title}</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
          <p className="text-zinc-500 text-sm uppercase tracking-widest mb-3">Features</p>
          <h2 className="text-3xl sm:text-4xl font-bold">Everything in one place.</h2>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.08 }} className="glass glass-hover rounded-2xl p-6 space-y-3">
              <span className="text-2xl">{f.icon}</span>
              <h3 className="text-white font-semibold">{f.title}</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="glass rounded-3xl p-10 sm:p-16 text-center space-y-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/10 to-blue-600/10 pointer-events-none" />
          <h2 className="text-3xl sm:text-5xl font-bold relative z-10">
            Ready to find your next<br /><span className="gradient-text">great hire?</span>
          </h2>
          <p className="text-zinc-400 max-w-md mx-auto relative z-10">Whether you&apos;re a candidate or a recruiter — Flux has you covered.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center relative z-10">
            <Link href="/apply" className="px-8 py-3.5 bg-white text-black font-semibold rounded-full hover:bg-zinc-100 transition-all text-sm">Apply now →</Link>
            <Link href="/employer/login" className="px-8 py-3.5 border border-zinc-700 text-zinc-300 font-medium rounded-full hover:border-zinc-500 transition-all text-sm">Post a job</Link>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-zinc-600 text-sm">
          <p className="text-zinc-600 text-sm">Powered by <span className="text-zinc-400 font-medium">Shiprocket</span></p>
        </div>
      </footer>
    </div>
  );
}
