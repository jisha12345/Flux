import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase";

const MASTER_EMAIL = "jisha.bawa@shiprocket.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://flux-swart-five.vercel.app";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const supabase = await createServerSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || session.user.email !== MASTER_EMAIL) {
      return NextResponse.json({ error: "Only the master account can send invites" }, { status: 403 });
    }

    const service = createServiceClient();
    const redirectTo = `${SITE_URL}/auth/callback`;

    // inviteUserByEmail creates the user (if new) + sends an invite email
    const { error } = await service.auth.admin.inviteUserByEmail(email, { redirectTo });

    if (error) {
      // User already exists — generate a fresh magic link instead
      if (error.message?.toLowerCase().includes("already") || error.status === 422) {
        const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo },
        });
        if (linkError) throw linkError;
        // Return the action_link so the admin can share it manually
        return NextResponse.json({
          success: true,
          existing_user: true,
          action_link: (linkData as { properties?: { action_link?: string } })?.properties?.action_link ?? null,
        });
      }
      throw error;
    }

    return NextResponse.json({ success: true, existing_user: false });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to send invite" }, { status: 500 });
  }
}
