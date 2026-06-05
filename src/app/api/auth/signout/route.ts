import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function POST() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/employer/login", process.env.NEXT_PUBLIC_SITE_URL ?? "https://flux-swart-five.vercel.app"));
}
