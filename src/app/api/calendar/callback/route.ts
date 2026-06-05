import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const userId = searchParams.get("state");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://flux-swart-five.vercel.app";

  if (!code || !userId) return NextResponse.redirect(`${siteUrl}/employer/dashboard?error=calendar_auth_failed`);

  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? `${siteUrl}/api/calendar/callback`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    const reason = tokens.error ?? "no_access_token";
    return NextResponse.redirect(`${siteUrl}/employer/dashboard?error=calendar_token_failed&reason=${encodeURIComponent(reason)}`);
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const service = createServiceClient();
  await service.from("google_tokens").upsert({
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  return NextResponse.redirect(`${siteUrl}/employer/dashboard?calendar=connected&tab=interviews`);
}
