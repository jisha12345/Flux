"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import Link from "next/link";

export default function EmployerLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/employer/dashboard");
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/3 w-96 h-96 rounded-full bg-blue-600/10 blur-[100px]" />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8 space-y-2">
          <Link href="/" className="inline-block text-2xl font-bold gradient-text mb-4">Flux</Link>
          <h1 className="text-2xl font-bold">Recruiter login</h1>
          <p className="text-zinc-500 text-sm">Access your candidate pipeline</p>
        </div>

        <form onSubmit={handleLogin} className="glass rounded-2xl p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-zinc-400 text-xs uppercase tracking-wider">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-white placeholder-zinc-700 outline-none focus:border-violet-500/40 transition-all text-sm"
              placeholder="you@company.com"
            />
          </div>
          <div className="space-y-2">
            <label className="text-zinc-400 text-xs uppercase tracking-wider">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-white placeholder-zinc-700 outline-none focus:border-violet-500/40 transition-all text-sm"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-red-400 text-xs px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-semibold rounded-xl hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 text-sm shadow-lg shadow-violet-500/20">
            {loading ? "Signing in..." : "Sign in →"}
          </button>
        </form>

        <p className="text-center text-zinc-600 text-sm mt-6">
          <Link href="/" className="hover:text-zinc-400 transition-colors">← Back to Flux</Link>
        </p>
      </motion.div>
    </div>
  );
}
