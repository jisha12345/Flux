"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

async function signInWithGoogle() {
  const supabase = createClient();
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
}

const SHIPROCKET_ORANGE = "#7C3AED";
const MASTER_EMAIL = "jisha.bawa@shiprocket.com";

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" />
  </svg>
);

type AccessStatus = "idle" | "checking" | "admin" | "recruiter" | "unknown";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() => {
    const e = searchParams.get("error");
    if (e === "auth_callback_failed") return "Login failed. Try again.";
    if (e === "access_denied") return "Your Google account doesn't have access. Ask jisha.bawa@shiprocket.com for an invite.";
    return "";
  });
  const [magicSent, setMagicSent] = useState(false);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>("idle");

  // If already logged in, skip straight to dashboard
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) window.location.href = "/employer/dashboard";
    });
  }, []);

  // Debounced access check on email change
  useEffect(() => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@") || trimmed.length < 5) {
      setAccessStatus("idle");
      return;
    }
    // Master email check is client-side — instant, no API call
    if (trimmed === MASTER_EMAIL) {
      setAccessStatus("admin");
      return;
    }
    setAccessStatus("checking");
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/check-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed }),
        });
        const data = await res.json();
        if (data.allowed) setAccessStatus("recruiter");
        else setAccessStatus("unknown");
      } catch {
        setAccessStatus("unknown");
      }
    }, 600);
    return () => clearTimeout(t);
  }, [email]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (accessStatus !== "admin") return;
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      window.location.href = "/employer/dashboard";
    }
  }

  async function handleMagicLink() {
    if (accessStatus !== "admin") return;
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setMagicSent(true);
      setLoading(false);
    }
  }

  async function handleRecruiterMagicLink() {
    if (accessStatus !== "recruiter") return;
    setLoading(true);
    setError("");
    const supabase = createClient();
    // shouldCreateUser: false — only works for existing invited users
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setMagicSent(true);
      setLoading(false);
    }
  }

  if (magicSent) {
    return (
      <div className="text-center space-y-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
          style={{ background: "rgba(124,58,237,0.1)" }}
        >
          <span className="text-xl" style={{ color: SHIPROCKET_ORANGE }}>✓</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Check your inbox</h2>
        <p className="text-gray-500 text-sm">
          Magic link sent to <strong className="text-gray-900">{email}</strong>. Valid for one use.
        </p>
        <button
          onClick={() => { setMagicSent(false); setEmail(""); setAccessStatus("idle"); }}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: SHIPROCKET_ORANGE }}>
          <ShieldIcon className="w-4 h-4 fill-white" />
        </div>
        <span className="font-bold text-xl text-gray-900">Reqr</span>
        <span className="text-xs text-gray-400">by Shiprocket</span>
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Recruiter login</h1>
        <p className="text-sm text-gray-500">Internal access only.</p>
      </div>

      {error && accessStatus === "idle" && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(""); }}
          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
          onFocus={(e) => { e.currentTarget.style.borderColor = SHIPROCKET_ORANGE; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.12)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
          placeholder="your@shiprocket.com"
          autoFocus
        />
        {accessStatus === "checking" && (
          <p className="text-xs text-gray-400 mt-1.5">Checking access…</p>
        )}
      </div>

      {/* Unknown email */}
      {accessStatus === "unknown" && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
          Access is invite-only. Ask{" "}
          <strong>{MASTER_EMAIL}</strong> to send you an invite.
        </div>
      )}

      {/* Recruiter: magic link only */}
      {accessStatus === "recruiter" && (
        <div className="space-y-3">
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="button"
            onClick={handleRecruiterMagicLink}
            disabled={loading}
            className="w-full py-2.5 text-white font-semibold rounded-xl text-sm disabled:opacity-40 hover:opacity-90 transition-all"
            style={{ background: SHIPROCKET_ORANGE }}
          >
            {loading ? "Sending…" : "Send me a login link"}
          </button>
          <p className="text-xs text-gray-400 text-center">
            A one-time link will be emailed to you.
          </p>
        </div>
      )}

      {/* Admin: password + magic link */}
      {accessStatus === "admin" && (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none"
              onFocus={(e) => { e.currentTarget.style.borderColor = SHIPROCKET_ORANGE; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.12)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full py-2.5 text-white font-semibold rounded-xl text-sm disabled:opacity-40 hover:opacity-90 transition-all"
            style={{ background: SHIPROCKET_ORANGE }}
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            className="w-full py-2.5 text-gray-500 font-medium rounded-xl text-sm hover:bg-gray-100 transition-all"
            onClick={handleMagicLink}
            disabled={loading}
          >
            Send magic link instead
          </button>
        </form>
      )}

      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
        <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">or</span></div>
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all text-sm"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Sign in with Google
      </button>

      <p className="text-center text-xs text-gray-400">
        <Link href="/employer/reset-password" className="underline hover:text-gray-600">
          Forgot password?
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6" style={{ background: "#F4F5F7" }}>
      <Suspense fallback={<div className="text-sm text-gray-400">Loading…</div>}>
        <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <LoginForm />
        </div>
      </Suspense>
    </main>
  );
}
