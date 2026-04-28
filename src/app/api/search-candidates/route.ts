import { NextRequest, NextResponse } from "next/server";
import { getAnthropic } from "@/lib/claude";

interface SearchResult { url: string; title: string; snippet: string; }

async function webSearch(query: string): Promise<SearchResult[]> {
  // 1. Serper.dev — 2500 free queries, no credit card (serper.dev)
  const serperKey = process.env.SERPER_API_KEY;
  if (serperKey) {
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, num: 10, gl: "in" }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      return (data.organic || []).map((r: { link: string; title: string; snippet: string }) => ({
        url: r.link, title: r.title, snippet: r.snippet,
      }));
    } catch { /* fall through */ }
  }

  // 2. DuckDuckGo HTML — no API key needed
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(12000),
    });
    const html = await res.text();
    const urls: SearchResult[] = [];
    // Extract result URLs from DuckDuckGo HTML
    const linkPattern = /class="result__url"[^>]*>([^<]+)</g;
    const snippetPattern = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    const hrefPattern = /href="\/\/duckduckgo\.com\/l\/\?uddg=([^"&]+)/g;

    let m;
    while ((m = hrefPattern.exec(html)) !== null) {
      try {
        const url = decodeURIComponent(m[1]);
        if (!urls.find(u => u.url === url)) urls.push({ url, title: "", snippet: "" });
      } catch { /* skip malformed */ }
    }
    // Also try direct href links
    const directPattern = /href="(https:\/\/(?:www\.linkedin\.com\/in|github\.com)[^"]+)"/g;
    while ((m = directPattern.exec(html)) !== null) {
      const url = m[1].split("&")[0];
      if (!urls.find(u => u.url === url)) urls.push({ url, title: "", snippet: "" });
    }
    void linkPattern; void snippetPattern;
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
      const found = await webSearch(`${q} ${jd_brief ? jd_brief.slice(0, 50) : ""}`);
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
      serper_configured: !!process.env.SERPER_API_KEY,
      playwright_configured: !!(process.env.PLAYWRIGHT_WS_URL || process.env.CHROMIUM_EXECUTABLE_PATH),
      scrapingdog_configured: !!process.env.SCRAPINGDOG_API_KEY,
    },
  });
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
