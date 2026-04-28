import { NextRequest, NextResponse } from "next/server";
import { getAnthropic } from "@/lib/claude";

interface SearchResult { url: string; title: string; snippet: string; }

async function googleSearch(query: string): Promise<SearchResult[]> {
  // Use Brave Search API if configured, else SerpAPI, else direct Google
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (braveKey) {
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`, {
      headers: { "Accept": "application/json", "X-Subscription-Token": braveKey },
    });
    const data = await res.json();
    return (data.web?.results || []).map((r: { url: string; title: string; description: string }) => ({
      url: r.url, title: r.title, snippet: r.description,
    }));
  }

  // Fallback: Google via user-agent spoofing (works in dev, unreliable in prod)
  try {
    const res = await fetch(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    const urls: SearchResult[] = [];
    const pattern = /href="(https:\/\/(?:www\.linkedin\.com\/in|github\.com|naukri\.com|hirist\.tech|iimjobs\.com)[^"]+)"/g;
    let m;
    while ((m = pattern.exec(html)) !== null) {
      const url = m[1].split("&")[0];
      if (!urls.find(u => u.url === url)) urls.push({ url, title: "", snippet: "" });
    }
    return urls.slice(0, 10);
  } catch {
    return [];
  }
}

async function scrapeWithPlaywright(url: string): Promise<string> {
  const wsUrl = process.env.PLAYWRIGHT_WS_URL;
  try {
    const { chromium } = await import("playwright-core");
    const browser = wsUrl
      ? await chromium.connect(wsUrl)
      : await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    const text = await page.evaluate(() => document.body.innerText);
    await browser.close();
    return text.slice(0, 4000);
  } catch {
    return "";
  }
}

async function fetchViaScrapingdog(url: string): Promise<string> {
  const key = process.env.SCRAPINGDOG_API_KEY;
  if (!key) return "";
  try {
    const res = await fetch(`https://api.scrapingdog.com/scrape?api_key=${key}&url=${encodeURIComponent(url)}&dynamic=true`, { signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    return text.slice(0, 4000);
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  try {
    const { role, skills, location, platforms, jd_brief } = await req.json();
    if (!role) return NextResponse.json({ error: "role required" }, { status: 400 });

  const skillStr = (skills || []).slice(0, 4).join(" ");
  const locationStr = location || "India";
  const queries: Record<string, string[]> = {
    linkedin: [
      `site:linkedin.com/in "${role}" "${skillStr}" ${locationStr}`,
      `site:linkedin.com/in "${role}" ${locationStr} -jobs`,
    ],
    github: [
      `site:github.com "${role}" "${skillStr}"`,
    ],
    naukri: [
      `site:naukri.com "${role}" ${skillStr}`,
    ],
    iimjobs: [
      `site:iimjobs.com "${role}"`,
    ],
    hirist: [
      `site:hirist.tech "${role}"`,
    ],
  };

  const requestedPlatforms: string[] = platforms || ["linkedin", "github"];
  const results: SearchResult[] = [];

  for (const platform of requestedPlatforms) {
    const platformQueries = queries[platform] || [];
    for (const q of platformQueries) {
      const found = await googleSearch(`${q} ${jd_brief ? jd_brief.slice(0, 50) : ""}`);
      results.push(...found.filter(r => !results.find(x => x.url === r.url)));
      if (results.length >= 20) break;
    }
    if (results.length >= 20) break;
  }

  // Deduplicate by domain/path
  const seen = new Set<string>();
  const unique = results.filter(r => {
    const key = r.url.split("?")[0].replace(/\/$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 15);

  // For LinkedIn profiles, optionally deep-scrape via Scrapingdog
  const enriched = await Promise.all(unique.map(async r => {
    if (!r.url.includes("linkedin.com/in/")) return { ...r, pageText: "" };
    const text = await fetchViaScrapingdog(r.url) || await scrapeWithPlaywright(r.url);
    return { ...r, pageText: text };
  }));

  // Let Claude parse what we found
  const profileable = enriched.filter(r => r.pageText.length > 200);
  let parsed: Record<string, unknown>[] = [];

  if (profileable.length > 0 && process.env.ANTHROPIC_API_KEY) {
    const prompt = `Extract structured candidate info from these LinkedIn/profile pages. Return a JSON array.

${profileable.map((r, i) => `--- Profile ${i + 1}: ${r.url}\n${r.pageText.slice(0, 800)}`).join("\n\n")}

For each profile, return:
{"name": "...", "role": "...", "company": "...", "skills": [...], "location": "...", "url": "..."}

Return ONLY valid JSON array. If you cannot parse a profile, skip it.`;

    try {
      const msg = await getAnthropic().messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      const text = (msg.content[0] as { type: string; text: string }).text;
      const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      parsed = JSON.parse(clean);
    } catch { /* parsing failed */ }
  }

  return NextResponse.json({
    success: true,
    urls: unique,
    parsed,
    meta: {
      total: unique.length,
      enriched: profileable.length,
      brave_configured: !!process.env.BRAVE_SEARCH_API_KEY,
      playwright_configured: !!(process.env.PLAYWRIGHT_WS_URL || process.env.CHROMIUM_EXECUTABLE_PATH),
      scrapingdog_configured: !!process.env.SCRAPINGDOG_API_KEY,
    },
  });
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
