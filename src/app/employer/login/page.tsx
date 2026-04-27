"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Suspense } from "react";

type AuthMode = "password" | "magic" | "signup";

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

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");

  const [mode, setMode] = useState<AuthMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(urlError || "");
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const redirectTo = typeof window !== "undefined"
    ? `${window.location.origin}/auth/callback`
    : "/auth/callback";

  async function handleGoogle() {
    setGoogleLoading(true);
    setError("");
    try {
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) {
        setError(error.message);
        setGoogleLoading(false);
      }
      // On success the browser redirects — loading state intentionally stays
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed. Make sure Supabase is configured.");
      setGoogleLoading(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (mode === "signup") {
        const { error } = await getSupabase().auth.signUp({ email, password });
        if (error) throw error;
        setError("");
        // Show success — they need to verify email
        setMagicSent(true);
      } else if (mode === "magic") {
        const { error } = await getSupabase().auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        setMagicSent(true);
      } else {
        const { error } = await getSupabase().auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/employer/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-sm relative z-10"
    >
      <div className="text-center mb-8 space-y-2">
        <Link href="/" className="inline-block text-3xl font-black gradient-text drop-shadow-lg mb-4">Flux</Link>
        <h1 className="text-2xl font-bold">
          {mode === "signup" ? "Create recruiter account" : "Recruiter login"}
        </h1>
        <p className="text-zinc-500 text-sm">Access your candidate pipeline</p>
      </div>

      <AnimatePresence mode="wait">
        {magicSent ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass rounded-2xl p-8 text-center space-y-4"
          >
            <div className="text-4xl">{mode === "signup" ? "🎉" : "📬"}</div>
            <h2 className="text-lg font-semibold">
              {mode === "signup" ? "Account created!" : "Check your inbox"}
            </h2>
            <p className="text-zinc-400 text-sm">
              {mode === "signup"
                ? `We sent a confirmation to ${email}. Click the link to activate your account.`
                : `Magic link sent to ${email}. Click it to sign in.`}
            </p>
            <button onClick={() => { setMagicSent(false); setEmail(""); setPassword(""); }}
              className="text-zinc-500 text-sm hover:text-white transition-colors">
              Use a different email
            </button>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            {/* Google */}
            <button
              onClick={handleGoogle}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 py-3 bg-white text-zinc-900 font-medium rounded-xl hover:bg-zinc-100 active:scale-95 transition-all text-sm disabled:opacity-60"
            >
              {googleLoading
                ? <span className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
                : <GoogleIcon />}
              {googleLoading ? "Redirecting to Google..." : "Continue with Google"}
            </button>

            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-white/8" />
              <span className="text-zinc-600 text-xs uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-white/8" />
            </div>

            {/* Email form */}
            <form onSubmit={handleEmailSubmit} className="glass rounded-2xl p-6 space-y-4">
              {/* Mode tabs */}
              <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
                {(["password", "magic", "signup"] as AuthMode[]).map((m) => (
                  <button key={m} type="button" onClick={() => { setMode(m); setError(""); }}
                    className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${mode === m ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
                    {m === "password" ? "Password" : m === "magic" ? "Magic link" : "Sign up"}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-zinc-400 text-xs uppercase tracking-wider">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="w-full bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-white placeholder-zinc-700 outline-none focus:border-violet-500/40 transition-all text-sm"
                  placeholder="you@company.com"
                />
              </div>

              <AnimatePresence>
                {(mode === "password" || mode === "signup") && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
                    <label className="text-zinc-400 text-xs uppercase tracking-wider">Password</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                      required={mode === "password" || mode === "signup"}
                      minLength={mode === "signup" ? 8 : undefined}
                      className="w-full bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-white placeholder-zinc-700 outline-none focus:border-violet-500/40 transition-all text-sm"
                      placeholder={mode === "signup" ? "Min. 8 characters" : "••••••••"}
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

              <button type="submit" disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-semibold rounded-xl hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 text-sm shadow-lg shadow-violet-500/20">
                {loading
                  ? "Please wait..."
                  : mode === "signup" ? "Create account →"
                  : mode === "magic" ? "Send magic link →"
                  : "Sign in →"}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-center text-zinc-600 text-sm mt-6">
        <Link href="/" className="hover:text-zinc-400 transition-colors">← Back to Flux</Link>
      </p>
    </motion.div>
  );
}

export default function EmployerLogin() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/3 w-96 h-96 rounded-full bg-blue-600/10 blur-[100px]" />
      </div>
      <Suspense>
        <LoginContent />
      </Suspense>
    </div>
  );
}
