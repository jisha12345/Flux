import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase";

const MASTER_EMAIL = "jisha.bawa@shiprocket.com";

async function isEmailAllowed(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (normalized === MASTER_EMAIL) return true;
  const service = createServiceClient();
  const { data, error } = await service.rpc("user_email_exists", { p_email: normalized });
  if (error) return false;
  return !!data;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/employer/dashboard";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      const email = data.session.user.email ?? "";
      const allowed = await isEmailAllowed(email);
      if (!allowed) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/employer/login?error=access_denied&reason=not_invited`);
      }
      const type = searchParams.get("type");
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/employer/set-password`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/employer/login?error=auth_callback_failed`);
}
