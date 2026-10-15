import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase";

/**
 * Authenticated bridge to a private Supabase Storage object. The object path
 * never becomes public; each click receives a fresh one-hour signed URL.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const service = createServiceClient();
  const { data: interview, error } = await service
    .from("ai_interviews")
    .select("video_path")
    .eq("id", id)
    .maybeSingle();
  if (error || !interview?.video_path) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const { data: signed, error: signError } = await service.storage
    .from("interview-recordings")
    .createSignedUrl(interview.video_path, 60 * 60);
  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Recording is temporarily unavailable" }, { status: 503 });
  }

  return NextResponse.redirect(signed.signedUrl, 302);
}
