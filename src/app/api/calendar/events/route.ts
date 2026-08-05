import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase";

async function getValidToken(userId: string): Promise<string | null> {
  const service = createServiceClient();
  const { data } = await service.from("google_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return null;

  if (new Date(data.expires_at) > new Date(Date.now() + 60_000)) return data.access_token;

  // Refresh
  if (!data.refresh_token) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const tokens = await res.json();
  if (!tokens.access_token) return null;

  await service.from("google_tokens").update({
    access_token: tokens.access_token,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);

  return tokens.access_token;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { candidate_id, candidate_name, interviewer_name, interviewer_email, extra_attendees, scheduled_at, duration_minutes = 60, round = 1, title } = await request.json();

  const token = await getValidToken(session.user.id);
  const service = createServiceClient();

  const startTime = new Date(scheduled_at);
  const endTime = new Date(startTime.getTime() + duration_minutes * 60_000);

  let meetLink = "";
  let calendarEventId = "";
  let calendarError = "";

  if (token) {
    const event = {
      summary: title ?? `${round === 1 ? "Screening call" : `Interview round ${round}`}: ${candidate_name}`,
      description: `Candidate: ${candidate_name}\nInterviewer: ${interviewer_name}\nRound: ${round}\n\nScheduled via Reqr by Shiprocket`,
      start: { dateTime: startTime.toISOString(), timeZone: "Asia/Kolkata" },
      end: { dateTime: endTime.toISOString(), timeZone: "Asia/Kolkata" },
      attendees: [
        ...(extra_attendees ?? [interviewer_email, "hr@shiprocket.com", session.user.email])
          .filter(Boolean)
          .filter((e: string, i: number, arr: string[]) => arr.indexOf(e) === i)
          .map((email: string) => ({ email })),
      ],
      conferenceData: {
        createRequest: {
          requestId: `reqr-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    };

    const calRes = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(event),
      }
    );
    const calData = await calRes.json();
    if (calData.error) {
      calendarError = `${calData.error.code}: ${calData.error.message ?? JSON.stringify(calData.error)}`;
    } else {
      const entryPoints: { uri?: string; entryPointType?: string }[] = calData.conferenceData?.entryPoints ?? [];
      const videoEntry = entryPoints.find((e) => e.entryPointType === "video") ?? entryPoints[0];
      meetLink = calData.hangoutLink ?? videoEntry?.uri ?? "";
      calendarEventId = calData.id ?? "";
      if (!meetLink) calendarError = `Event created (${calData.id}) but no Meet link returned. conferenceStatus: ${calData.conferenceData?.createRequest?.status?.statusCode ?? "unknown"}`;
    }
  }

  // Save interview record
  const { data: interview, error } = await service.from("interviews").insert({
    candidate_id,
    candidate_name,
    round,
    interviewer_name,
    interviewer_email,
    scheduled_at,
    duration_minutes,
    meet_link: meetLink,
    calendar_event_id: calendarEventId,
    status: "scheduled",
    created_by: session.user.id,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ interview, meet_link: meetLink, calendar_connected: !!token, calendar_error: calendarError || undefined });
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const candidateId = searchParams.get("candidate_id");

  const service = createServiceClient();
  let query = service.from("interviews").select("*").order("scheduled_at", { ascending: false });
  if (candidateId) query = query.eq("candidate_id", candidateId);

  const { data } = await query;
  return NextResponse.json({ interviews: data ?? [] });
}
