import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

const MASTER_EMAIL = "jisha.bawa@shiprocket.com";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const supabase = await createServerSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || session.user.email !== MASTER_EMAIL) {
      return NextResponse.json({ error: "Only the master account can send invites" }, { status: 403 });
    }

    const { error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://flux-swart-five.vercel.app"}/auth/callback`,
      },
    });

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to send magic link" }, { status: 500 });
  }
}
