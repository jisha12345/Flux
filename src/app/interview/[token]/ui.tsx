"use client";

/** Small shared atoms for the candidate interview experience. */

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function PrimaryButton({ className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-6",
        "text-sm font-semibold text-[#06251a] transition-colors duration-200",
        "hover:bg-emerald-300 active:bg-emerald-400",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1210]",
        "disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500",
        className
      )}
    />
  );
}

export function GhostButton({ className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-transparent px-5",
        "text-sm font-medium text-zinc-200 transition-colors duration-200",
        "hover:border-white/25 hover:bg-white/5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1210]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
    />
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300">
      {children}
    </span>
  );
}

export function BrandHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-baseline gap-3">
        <span className="text-xl font-semibold tracking-tight text-emerald-400">
          Reqr
        </span>
        <span className="h-4 w-px self-center bg-white/15" aria-hidden />
        <span className="text-sm text-zinc-400">AI Interview</span>
      </div>
      {right}
    </header>
  );
}

/** Human-readable label for the Sarvam-ish language codes we use. */
export function languageLabel(code: string): string {
  const map: Record<string, string> = {
    "en-IN": "English",
    "hi-IN": "Hindi",
    "bn-IN": "Bengali",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
    "kn-IN": "Kannada",
    "ml-IN": "Malayalam",
    "mr-IN": "Marathi",
    "gu-IN": "Gujarati",
    "pa-IN": "Punjabi",
  };
  return map[code] ?? code;
}

export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}
