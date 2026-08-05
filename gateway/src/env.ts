/**
 * Gateway environment. Loads gateway/.env first, then falls back to the Next.js
 * app's .env.local at the repo root so local dev needs the keys in one place.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(here, "..", ".env") });
config({ path: path.join(here, "..", "..", ".env.local") });

function pick(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

const missing: string[] = [];
function required(label: string, ...names: string[]): string {
  const value = pick(...names);
  if (!value) missing.push(label);
  return value ?? "";
}

export const env = {
  PORT: Number(pick("GATEWAY_PORT") ?? 8787),
  /** Comma-separated allowed origins for CORS + WS; "*" for local dev. */
  ALLOWED_ORIGINS: pick("GATEWAY_ALLOWED_ORIGINS") ?? "*",

  SUPABASE_URL: required("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: required("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
  ANTHROPIC_API_KEY: required("ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"),
  SARVAM_API_KEY: required("SARVAM_API_KEY", "SARVAM_API_KEY"),

  INTERVIEW_MODEL: pick("INTERVIEW_MODEL") ?? "claude-sonnet-5",
  BLUEPRINT_MODEL: pick("BLUEPRINT_MODEL") ?? "claude-sonnet-5",
  EVAL_MODEL: pick("EVAL_MODEL") ?? "claude-opus-5",

  SARVAM_STT_MODEL: pick("SARVAM_STT_MODEL") ?? "saarika:v2.5",
  SARVAM_TTS_MODEL: pick("SARVAM_TTS_MODEL") ?? "bulbul:v3",
  SARVAM_TTS_VOICE: pick("SARVAM_TTS_VOICE") ?? "ritu",
  SARVAM_TTS_SAMPLE_RATE: Number(pick("SARVAM_TTS_SAMPLE_RATE") ?? 22050),
  SARVAM_BASE_URL: pick("SARVAM_BASE_URL") ?? "https://api.sarvam.ai",
};

if (missing.length > 0) {
  console.error(
    `[gateway] Missing required env vars:\n  - ${missing.join("\n  - ")}\n` +
      `Set them in gateway/.env or the repo root .env.local`,
  );
  process.exit(1);
}
