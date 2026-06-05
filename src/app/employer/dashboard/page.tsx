import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase";
import DashboardClient from "./dashboard-client";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/employer/login");

  const service = createServiceClient();
  const [candResult, jobsResult] = await Promise.all([
    service.from("candidates").select("*").order("score", { ascending: false, nullsFirst: false }).range(0, 499),
    service.from("jobs").select("*").order("created_at", { ascending: false }),
  ]);

  return (
    <Suspense>
      <DashboardClient
        candidates={candResult.data ?? []}
        jobs={jobsResult.data ?? []}
        userEmail={session.user.email ?? ""}
      />
    </Suspense>
  );
}
