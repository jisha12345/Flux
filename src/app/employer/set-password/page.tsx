"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

const OR = "#7C3AED";

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setDone(true);
      setTimeout(() => router.push("/employer/dashboard"), 2000);
    }
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6" style={{ background: "#F4F5F7" }}>
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto" style={{ background: "rgba(124,58,237,0.1)" }}>
            <span className="text-xl" style={{ color: OR }}>✓</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Password set</h2>
          <p className="text-sm text-gray-500">Redirecting to dashboard…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6" style={{ background: "#F4F5F7" }}>
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Set your password</h1>
        <p className="text-sm text-gray-500 mb-6">Choose a password you&apos;ll use to log in next time.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">New password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              onFocus={e => { e.currentTarget.style.borderColor = OR; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.12)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
              placeholder="Min. 8 characters"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              onFocus={e => { e.currentTarget.style.borderColor = OR; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.12)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
              placeholder="Re-enter password"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password || !confirm}
            className="w-full py-2.5 text-white font-semibold rounded-xl text-sm disabled:opacity-40 hover:opacity-90 transition-all"
            style={{ background: OR }}
          >
            {loading ? "Saving…" : "Set password"}
          </button>
        </form>
      </div>
    </main>
  );
}
