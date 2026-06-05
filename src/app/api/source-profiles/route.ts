import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { anthropic } from "@/lib/claude";

const BOARDS = [
  {
    name: "Naukri",
    url: (q: string) => `https://www.naukri.com/jobs-in-india?q=${q}&experience=2&location=India`,
  },
  {
    name: "LinkedIn",
    url: (q: string) => `https://www.linkedin.com/jobs/search/?keywords=${q}&location=India&f_TPR=r604800`,
  },
  {
    name: "Indeed",
    url: (q: string) => `https://in.indeed.com/jobs?q=${q}&l=India&fromage=7`,
  },
  {
    name: "Internshala",
    url: (q: string) => `https://internshala.com/jobs/keyword-${q.replace(/\+/g, "-")}/`,
  },
];

async function scrapeBoard(apiKey: string, url: string): Promise<string> {
  try {
    const scrapeUrl = `https://api.scrapingdog.com/scrape?api_key=${apiKey}&url=${encodeURIComponent(url)}&dynamic=true`;
    const res = await fetch(scrapeUrl, { signal: AbortSignal.timeout(18000) });
    return await res.text();
  } catch {
    return "";
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("job_id");
    if (!jobId) return NextResponse.json({ error: "Missing job_id" }, { status: 400 });

    const supabase = await createServerSupabaseClient();
    const { data: job } = await supabase.from("jobs").select("title, description, skills").eq("id", jobId).single();
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const apiKey = process.env.SCRAPINGDOG_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ScrapingDog not configured" }, { status: 503 });

    const topSkills = Array.isArray(job.skills) ? job.skills.slice(0, 3).join(" ") : job.title;
    const query = encodeURIComponent(`${job.title} ${topSkills} India`);

    // Scrape all boards concurrently
    const scrapeResults = await Promise.allSettled(
      BOARDS.map((board) => scrapeBoard(apiKey, board.url(query)))
    );

    const htmlByBoard: Record<string, string> = {};
    BOARDS.forEach((board, i) => {
      const result = scrapeResults[i];
      if (result.status === "fulfilled" && result.value.length > 500) {
        htmlByBoard[board.name] = result.value.slice(0, 6000);
      }
    });

    const boardsWithData = Object.keys(htmlByBoard);
    if (boardsWithData.length === 0) {
      return NextResponse.json({ profiles: [], boards_searched: [] });
    }

    const boardSummary = boardsWithData.map(
      (name) => `\n=== ${name} ===\n${htmlByBoard[name]}`
    ).join("\n");

    const parseResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [{
        role: "user",
        content: `You are a talent sourcer. Extract and rank candidate profiles from these job board search results for the role: ${job.title}

Required skills: ${topSkills}
Job description context: ${(job.description ?? "").slice(0, 500)}

SEARCH RESULTS FROM MULTIPLE BOARDS:
${boardSummary}

Extract up to 15 candidate profiles. For each profile found, create:
{
  "name": "candidate name or 'Anonymous Candidate'",
  "current_role": "current or recent title",
  "company": "company name",
  "skills": ["skill1", "skill2", "skill3"],
  "match_score": <60-99, based on exact skill match to the JD>,
  "profile_url": "direct URL to this profile if found, else empty string",
  "source": "Naukri|LinkedIn|Indeed|Internshala",
  "summary": "one sentence: why this person is a strong or weak fit for ${job.title}"
}

Rank by match_score descending. Return only a JSON array.`,
      }],
    });

    const parseText = parseResponse.content[0].type === "text" ? parseResponse.content[0].text : "[]";
    const profiles = JSON.parse(parseText.match(/\[[\s\S]*\]/)?.[0] ?? "[]");

    return NextResponse.json({
      profiles: profiles.sort((a: { match_score: number }, b: { match_score: number }) => b.match_score - a.match_score),
      boards_searched: boardsWithData,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Sourcing failed" }, { status: 500 });
  }
}
