import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function JobsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/employer/login");

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("employer_id", session.user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <span className="font-bold">Jobs</span>
        <div className="flex gap-3">
          <Link href="/employer/jd-builder">
            <Button size="sm">+ New JD</Button>
          </Link>
          <Link href="/employer/dashboard">
            <Button variant="ghost" size="sm">Dashboard</Button>
          </Link>
        </div>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Your job listings</h1>
        {(jobs ?? []).length === 0 ? (
          <div className="bg-white rounded-lg border p-8 text-center">
            <p className="text-muted-foreground mb-4">No jobs posted yet.</p>
            <Link href="/employer/jd-builder">
              <Button>Create your first JD</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {(jobs ?? []).map((job) => (
              <div key={job.id} className="bg-white rounded-lg border p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{job.title}</p>
                  <p className="text-sm text-muted-foreground">{new Date(job.created_at).toLocaleDateString("en-IN")}</p>
                </div>
                <Badge variant={job.is_active ? "default" : "secondary"}>
                  {job.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
