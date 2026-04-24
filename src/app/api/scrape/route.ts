import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/claude";
import { getSupabaseAdmin } from "@/lib/supabase";

// Extract LinkedIn profile ID from URL
function extractLinkedInId(input: string): string {
  const match = input.match(/linkedin\.com\/in\/([^/?]+)/);
  if (match) return match[1];
  return input.replace(/\/$/, ""); // assume raw ID was passed
}

// Use Claude to normalise raw LinkedIn data into our candidate schema
async function normaliseProfile(raw: Record<string, unknown>): Promise<Record<string, unknown>> {
  const prompt = `You are a recruiting assistant. Convert this raw LinkedIn profile JSON into a structured candidate record.

Raw profile:
${JSON.stringify(raw, null, 2)}

Return ONLY valid JSON with these fields (use null if not available):
{
  "full_name": "",
  "email": null,
  "phone": null,
  "current_role": "",
  "current_company": "",
  "company_type": "product|service|startup|logistics|mnc",
  "industry": "",
  "functional_area": "Product Management|Technology|Data Science & Analytics|Marketing & Growth|Design|Sales & Business Development|Operations|Finance|HR",
  "total_experience": "",
  "experience_years": 0,
  "previous_companies": "",
  "current_location": "",
  "highest_qualification": "",
  "college": "",
  "graduation_year": "",
  "tier": "Tier 1|Tier 2|Tier 3",
  "key_skills": "",
  "profile_summary": "",
  "linkedin_url": "",
  "current_ctc": null,
  "expected_ctc": null,
  "notice_period": null,
  "wfh_preference": "hybrid",
  "source": "linkedin"
}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (message.content[0] as { type: string; text: string }).text;
  return JSON.parse(text);
}

// Score the scraped candidate
async function scoreProfile(profile: Record<string, unknown>): Promise<{ score: number; breakdown: Record<string, unknown> }> {
  const prompt = `Score this candidate profile for an AI-first product/logistics company from 0-100.

Profile:
${JSON.stringify(profile, null, 2)}

Respond with ONLY valid JSON:
{
  "ai_depth": <0-25>,
  "communication": <0-25>,
  "experience_relevance": <0-25>,
  "ambition": <0-25>,
  "total": <0-100>,
  "summary": "<2 sentence recruiter note>"
}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (message.content[0] as { type: string; text: string }).text;
  const breakdown = JSON.parse(text);
  return { score: breakdown.total, breakdown };
}

export async function POST(req: NextRequest) {
  try {
    const { linkedin_url } = await req.json();
    if (!linkedin_url) return NextResponse.json({ error: "linkedin_url required" }, { status: 400 });

    const apiKey = process.env.SCRAPINGDOG_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "SCRAPINGDOG_API_KEY not configured" }, { status: 500 });

    const profileId = extractLinkedInId(linkedin_url);

    // Call Scrapingdog LinkedIn Profile API
    const scrapeRes = await fetch(
      `https://api.scrapingdog.com/profile/?api_key=${apiKey}&type=profile&id=${profileId}`,
      { method: "GET" }
    );

    if (!scrapeRes.ok) {
      return NextResponse.json({ error: `Scrapingdog error: ${scrapeRes.status}` }, { status: 502 });
    }

    const rawData = await scrapeRes.json();

    // Store raw scraped data
    const admin = getSupabaseAdmin();
    const { data: scraped } = await admin
      .from("scraped_profiles")
      .insert([{ source: "linkedin", source_url: linkedin_url, raw_data: rawData, status: "pending" }])
      .select()
      .single();

    // Normalise via Claude
    const normalised = await normaliseProfile(rawData);
    normalised.linkedin_url = linkedin_url;

    // Score via Claude
    const { score, breakdown } = await scoreProfile(normalised);

    // Insert as candidate
    const { data: candidate, error } = await admin
      .from("candidates")
      .insert([{ ...normalised, score, score_breakdown: breakdown, status: "new", source: "linkedin" }])
      .select()
      .single();

    if (error) throw error;

    // Link scraped record to candidate
    if (scraped) {
      await admin.from("scraped_profiles").update({ candidate_id: candidate.id, status: "imported" }).eq("id", scraped.id);
    }

    return NextResponse.json({ success: true, candidate });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Scraping failed" }, { status: 500 });
  }
}

// Bulk scrape multiple LinkedIn URLs
export async function PUT(req: NextRequest) {
  try {
    const { urls } = await req.json();
    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: "urls array required" }, { status: 400 });
    }
    if (urls.length > 20) {
      return NextResponse.json({ error: "Max 20 URLs per batch" }, { status: 400 });
    }

    const results = [];
    for (const url of urls) {
      try {
        const res = await fetch(`${req.nextUrl.origin}/api/scrape`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkedin_url: url }),
        });
        const data = await res.json();
        results.push({ url, success: data.success, candidate_id: data.candidate?.id, error: data.error });
      } catch {
        results.push({ url, success: false, error: "Failed" });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Bulk scrape failed" }, { status: 500 });
  }
}
