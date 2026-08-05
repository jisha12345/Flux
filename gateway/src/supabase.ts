import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { env } from "./env.js";
import type { AiInterviewRow, InterviewStatus, TurnRow } from "./types.js";

// supabase-js constructs a realtime client eagerly and needs a global
// WebSocket. Node 22 ships one; Node 20 does not, so fall back to `ws`
// (already a dependency) rather than pinning the runtime version.
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;
}

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function loadInterviewByToken(token: string): Promise<AiInterviewRow | null> {
  const { data, error } = await supabase
    .from("ai_interviews")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    console.error("[supabase] loadInterviewByToken:", error.message);
    return null;
  }
  return (data as AiInterviewRow | null) ?? null;
}

export async function updateInterview(
  id: string,
  patch: Partial<AiInterviewRow> & { status?: InterviewStatus },
): Promise<void> {
  const { error } = await supabase.from("ai_interviews").update(patch).eq("id", id);
  if (error) console.error("[supabase] updateInterview:", error.message);
}

export async function loadTurns(interviewId: string): Promise<TurnRow[]> {
  const { data, error } = await supabase
    .from("ai_interview_turns")
    .select("*")
    .eq("interview_id", interviewId)
    .order("seq", { ascending: true });
  if (error) {
    console.error("[supabase] loadTurns:", error.message);
    return [];
  }
  return (data as TurnRow[]) ?? [];
}

export async function insertTurn(
  interviewId: string,
  seq: number,
  role: TurnRow["role"],
  text: string,
  section: string | null,
): Promise<void> {
  const { error } = await supabase.from("ai_interview_turns").insert({
    interview_id: interviewId,
    seq,
    role,
    text,
    section,
  });
  if (error) console.error("[supabase] insertTurn:", error.message);
}

export async function uploadPhoto(interviewId: string, jpeg: Buffer): Promise<string | null> {
  const path = `${interviewId}.jpg`;
  const { error } = await supabase.storage
    .from("interview-photos")
    .upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
  if (error) {
    console.error("[supabase] uploadPhoto:", error.message);
    return null;
  }
  return path;
}

export async function uploadRecording(interviewId: string, webm: Buffer): Promise<string | null> {
  const path = `${interviewId}.webm`;
  const { error } = await supabase.storage
    .from("interview-recordings")
    .upload(path, webm, { contentType: "video/webm", upsert: true });
  if (error) {
    console.error("[supabase] uploadRecording:", error.message);
    return null;
  }
  return path;
}
