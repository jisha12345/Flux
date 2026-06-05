import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ connected: false, reason: "not_logged_in" });

  const service = createServiceClient();
  const { data, error } = await service
    .from("google_tokens")
    .select("expires_at, refresh_token")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ connected: false, reason: "no_token" });

  const expired = new Date(data.expires_at) < new Date();
  if (expired && !data.refresh_token) return NextResponse.json({ connected: false, reason: "token_expired_no_refresh" });

  return NextResponse.json({ connected: true });
}
