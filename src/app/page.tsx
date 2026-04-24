import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-16 text-center">
        <div className="space-y-4">
          <p className="text-zinc-500 text-sm uppercase tracking-widest">Flux</p>
          <h1 className="text-5xl font-bold leading-tight">
            Hiring for the AI era.<br />
            <span className="text-zinc-500">Always in motion.</span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-lg mx-auto">
            We don&apos;t care where you went to school. We care what you&apos;ve built, broken, and shipped.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/apply"
            className="px-8 py-3.5 bg-white text-black font-semibold rounded-full hover:bg-zinc-100 transition-all"
          >
            Apply now →
          </Link>
          <Link
            href="/employer/login"
            className="px-8 py-3.5 border border-zinc-700 text-zinc-300 font-medium rounded-full hover:border-zinc-500 transition-all"
          >
            Recruiter login
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-8 pt-8 border-t border-zinc-900">
          {[
            { label: "AI-first", desc: "Every role uses AI. Not as a tool — as a mindset." },
            { label: "Remote-friendly", desc: "Most teams are hybrid. Results > presence." },
            { label: "Fast ships", desc: "We move in weeks, not quarters." },
          ].map((item) => (
            <div key={item.label} className="space-y-2 text-left">
              <p className="text-white font-medium">{item.label}</p>
              <p className="text-zinc-500 text-sm">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
