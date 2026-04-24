"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

type AuthMode = "password" | "magic";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

export default function EmployerLogin() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);

  const redirectTo = typeof window !== "undefined"
    ? `${window.location.origin}/auth/callback`
    : "/auth/callback";

  async function handleOAuth(provider: "google" | "apple") {
    setOauthLoading(provider);
    setError("");
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) {
      setError(error.message);
      setOauthLoading(null);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (mode === "magic") {
      const { error } = await getSupabase().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        setError(error.message);
      } else {
        setMagicSent(true);
      }
    } else {
      const { error } = await getSupabase().auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        router.push("/employer/dashboard");
      }
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/3 w-96 h-96 rounded-full bg-blue-600/10 blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm relative z-10"
      >
        <div className="text-center mb-8 space-y-2">
          <Link href="/" className="inline-block text-3xl font-black gradient-text drop-shadow-lg mb-4">Flux</Link>
          <h1 className="text-2xl font-bold">Recruiter login</h1>
          <p className="text-zinc-500 text-sm">Access your candidate pipeline</p>
        </div>

        <AnimatePresence mode="wait">
          {magicSent ? (
            <motion.div
              key="magic-sent"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass rounded-2xl p-8 text-center space-y-4"
            >
              <div className="text-4xl">📬</div>
              <h2 className="text-lg font-semibold">Check your inbox</h2>
              <p className="text-zinc-400 text-sm">We sent a magic link to <span className="text-white">{email}</span>. Click it to sign in — no password needed.</p>
              <button
                onClick={() => { setMagicSent(false); setEmail(""); }}
                className="text-zinc-500 text-sm hover:text-white transition-colors"
              >
                Use a different email
              </button>
            </motion.div>
          ) : (
            <motion.div key="login-form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              {/* OAuth buttons */}
              <button
                onClick={() => handleOAuth("google")}
                disabled={!!oauthLoading}
                className="w-full flex items-center justify-center gap-3 py-3 bg-white text-zinc-900 font-medium rounded-xl hover:bg-zinc-100 active:scale-95 transition-all text-sm disabled:opacity-50"
              >
                {oauthLoading === "google" ? (
                  <span className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                Continue with Google
              </button>

              <button
                onClick={() => handleOAuth("apple")}
                disabled={!!oauthLoading}
                className="w-full flex items-center justify-center gap-3 py-3 bg-zinc-900 text-white font-medium rounded-xl border border-white/10 hover:bg-zinc-800 active:scale-95 transition-all text-sm disabled:opacity-50"
              >
                {oauthLoading === "apple" ? (
                  <span className="w-5 h-5 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
                ) : (
                  <AppleIcon />
                )}
                Continue with Apple
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-white/8" />
                <span className="text-zinc-600 text-xs uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-white/8" />
              </div>

              {/* Email form */}
              <form onSubmit={handleEmailSubmit} className="glass rounded-2xl p-6 space-y-4">
                <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
                  <button type="button" onClick={() => setMode("password")}
                    className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${mode === "password" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
                    Password
                  </button>
                  <button type="button" onClick={() => setMode("magic")}
                    className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${mode === "magic" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
                    Magic link
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-zinc-400 text-xs uppercase tracking-wider">Email</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600">
                      <EmailIcon />
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full bg-white/3 border border-white/8 rounded-xl pl-10 pr-4 py-3 text-white placeholder-zinc-700 outline-none focus:border-violet-500/40 transition-all text-sm"
                      placeholder="you@company.com"
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {mode === "password" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2 overflow-hidden"
                    >
                      <label className="text-zinc-400 text-xs uppercase tracking-wider">Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required={mode === "password"}
                        className="w-full bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-white placeholder-zinc-700 outline-none focus:border-violet-500/40 transition-all text-sm"
                        placeholder="••••••••"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {mode === "magic" && (
                  <p className="text-zinc-500 text-xs">We&apos;ll email you a secure link — no password needed.</p>
                )}

                {error && (
                  <p className="text-red-400 text-xs px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-semibold rounded-xl hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 text-sm shadow-lg shadow-violet-500/20"
                >
                  {loading
                    ? (mode === "magic" ? "Sending link..." : "Signing in...")
                    : (mode === "magic" ? "Send magic link →" : "Sign in →")}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-center text-zinc-600 text-sm mt-6">
          <Link href="/" className="hover:text-zinc-400 transition-colors">← Back to Flux</Link>
        </p>
      </motion.div>
    </div>
  );
}
