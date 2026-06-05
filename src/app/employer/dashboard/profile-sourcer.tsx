"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Job {
  id: string;
  title: string;
  description?: string;
}

interface Profile {
  name: string;
  current_role: string;
  company: string;
  skills: string[];
  match_score: number;
  profile_url: string;
  source: string;
  summary: string;
}

export default function ProfileSourcer({ jobs }: { jobs: Job[] }) {
  const [selectedJob, setSelectedJob] = useState(jobs[0]?.id ?? "");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [boardsSearched, setBoardsSearched] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function source() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/source-profiles?job_id=${selectedJob}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Sourcing failed");
    } else {
      setProfiles(data.profiles ?? []);
      setBoardsSearched(data.boards_searched ?? []);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border p-6">
        <h2 className="font-semibold mb-4">Source Profiles</h2>
        <div className="flex gap-3">
          <select
            value={selectedJob}
            onChange={e => setSelectedJob(e.target.value)}
            className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
          <Button onClick={source} disabled={loading || !selectedJob}>
            {loading ? "Sourcing…" : "Find profiles"}
          </Button>
        </div>
        {error && <p className="text-destructive text-sm mt-2">{error}</p>}
      </div>

      {profiles.length > 0 && (
        <div className="bg-white rounded-lg border divide-y">
          <div className="p-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{profiles.length} matches found</h3>
              {boardsSearched.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">Searched: {boardsSearched.join(" · ")}</p>
              )}
            </div>
            <span className="text-sm text-muted-foreground">Ranked by fit</span>
          </div>
          {profiles.map((p, i) => (
            <div key={i} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-muted-foreground">{p.current_role} · {p.company}</p>
                  <p className="text-sm mt-1 text-gray-600">{p.summary}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {p.skills.slice(0, 6).map(s => (
                      <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 ml-4">
                  <span className="text-lg font-bold">{p.match_score}%</span>
                  <Badge variant="outline" className="text-xs">{p.source}</Badge>
                  <a href={p.profile_url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline">View profile</Button>
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && profiles.length === 0 && (
        <div className="bg-white rounded-lg border p-8 text-center text-muted-foreground text-sm">
          Select a job and click &quot;Find profiles&quot; to source candidates from job boards.
        </div>
      )}
    </div>
  );
}
