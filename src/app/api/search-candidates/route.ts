import { NextRequest, NextResponse } from "next/server";
import { getAnthropic } from "@/lib/claude";

interface SearchResult { url: string; title: string; snippet: string; pageText?: string; }

async function searchViaPlaywright(query: string): Promise<SearchResult[]> {
  const wsUrl = process.env.PLAYWRIGHT_WS_URL;
  if (!wsUrl) return [];
  try {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.connect(wsUrl);
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&hl=en`, {
      waitUntil: "domcontentloaded", timeout: 20000,
    });
    await page.waitForTimeout(1500);

    const results = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a"))
        .map(a => {
          const url = (a as HTMLAnchorElement).href;
          const title = a.querySelector("h3")?.textContent?.trim() || a.textContent?.trim() || "";
          const parent = a.parentElement?.parentElement;
          const snippet = parent?.querySelector("div:not(:has(h3))")?.textContent?.trim() || "";
          return { url, title, snippet };
        })
        .filter(r =>
          r.url.match(/linkedin\.com\/in\/[a-zA-Z0-9-]+/) ||
          r.url.match(/github\.com\/[a-zA-Z0-9-]+$/) ||
          r.url.includes("naukri.com") ||
          r.url.includes("hirist.tech") ||
          r.url.includes("iimjobs.com")
        )
        .slice(0, 8);
    });

    await page.close();
    await browser.close();
    return results;
  } catch {
    return [];
  }
}

async function searchViaSerper(query: string): Promise<SearchResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 10, gl: "in" }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return (data.organic || []).map((r: { link: string; title: string; snippet: string }) => ({
      url: r.link, title: r.title, snippet: r.snippet,
    }));
  } catch { return []; }
}

async function fetchProfileViaPlaywright(url: string): Promise<string> {
  const wsUrl = process.env.PLAYWRIGHT_WS_URL;
  if (!wsUrl) return "";
  try {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.connect(wsUrl);
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(2000);

    const text = await page.evaluate(() => {
      const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
      const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";
      const title = document.title;
      const h1s = Array.from(document.querySelectorAll("h1,h2")).map(h => h.textContent?.trim()).filter(Boolean).join(" | ");
      const bodyText = document.body.innerText.slice(0, 3000);
      return `${title}\n${h1s}\n${metaDesc}\n${ogDesc}\n${bodyText}`;
    });

    await page.close();
    await browser.close();
    return text.slice(0, 4000);
  } catch { return ""; }
}

async function fetchViaScrapingdog(url: string): Promise<string> {
  const key = process.env.SCRAPINGDOG_API_KEY;
  if (!key || key === "your_scrapingdog_api_key") return "";
  try {
    const res = await fetch(`https://api.scrapingdog.com/scrape?api_key=${key}&url=${encodeURIComponent(url)}&dynamic=true`, { signal: AbortSignal.timeout(30000) });
    return (await res.text()).slice(0, 4000);
  } catch { return ""; }
}

export async function POST(req: NextRequest) {
  try {
    const { role, skills, location, platforms, jd_brief } = await req.json();
    if (!role) return NextResponse.json({ error: "role required" }, { status: 400 });

    const skillStr = (skills || []).slice(0, 3).join(" ");
    const locationStr = location || "India";
    const requestedPlatforms: string[] = platforms || ["linkedin"];

    const queries: string[] = [];
    if (requestedPlatforms.includes("linkedin")) {
      queries.push(`site:linkedin.com/in "${role}" ${skillStr} ${locationStr}`);
      queries.push(`site:linkedin.com/in "${role}" ${locationStr} -jobs`);
    }
    if (requestedPlatforms.includes("github")) queries.push(`site:github.com "${role}" ${skillStr}`);
    if (requestedPlatforms.includes("naukri")) queries.push(`site:naukri.com/mnjuser/profile "${role}" ${skillStr}`);
    if (requestedPlatforms.includes("iimjobs")) queries.push(`site:iimjobs.com "${role}"`);
    if (requestedPlatforms.includes("hirist")) queries.push(`site:hirist.tech "${role}"`);
    if (jd_brief) queries[0] = (queries[0] || "") + ` ${jd_brief.slice(0, 40)}`;

    // Search: Playwright (Google) > Serper > skip
    const allResults: SearchResult[] = [];
    const hasPlaywright = !!process.env.PLAYWRIGHT_WS_URL;
    const hasSerper = !!process.env.SERPER_API_KEY;

    for (const q of queries.slice(0, 3)) {
      const found = hasPlaywright
        ? await searchViaPlaywright(q)
        : hasSerper
          ? await searchViaSerper(q)
          : [];
      for (const r of found) {
        if (!allResults.find(x => x.url.split("?")[0] === r.url.split("?")[0])) allResults.push(r);
      }
      if (allResults.length >= 12) break;
    }

    const unique = allResults.slice(0, 10);

    // Fetch full profile text for each result
    const enriched = await Promise.all(unique.map(async r => {
      if (r.title && r.snippet && r.snippet.length > 80) return { ...r, pageText: `${r.title}\n${r.snippet}` };
      const text = await fetchViaScrapingdog(r.url) || await fetchProfileViaPlaywright(r.url);
      return { ...r, pageText: text };
    }));

    // Parse profiles with Claude
    const withText = enriched.filter(r => (r.pageText?.length || 0) > 100);
    const parsed: Record<string, unknown>[] = [];

    if (withText.length > 0 && process.env.ANTHROPIC_API_KEY) {
      for (const r of withText.slice(0, 6)) {
        const prompt = `Extract a candidate profile from this page content. Return ONLY valid JSON, no markdown:
{
  "full_name": "",
  "current_role": "",
  "current_company": "",
  "total_experience": "",
  "current_location": "",
  "key_skills": "",
  "profile_summary": "",
  "linkedin_url": "${r.url.includes("linkedin") ? r.url : ""}",
  "source_url": "${r.url}"
}

Page: ${r.url}
Content:
${(r.pageText || "").slice(0, 1500)}

If you cannot extract a real person's name, return null.`;
        try {
          const msg = await getAnthropic().messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 512,
            messages: [{ role: "user", content: prompt }],
          });
          const text = (msg.content[0] as { type: string; text: string }).text;
          const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
          if (clean === "null") continue;
          const profile = JSON.parse(clean);
          if (profile?.full_name) parsed.push({ ...profile, pageText: r.pageText });
        } catch { /* skip */ }
      }
    }

    return NextResponse.json({
      success: true,
      parsed,
      urls: unique,
      meta: {
        total: unique.length,
        parsed: parsed.length,
        playwright_configured: hasPlaywright,
        serper_configured: hasSerper,
        scrapingdog_configured: !!(process.env.SCRAPINGDOG_API_KEY && process.env.SCRAPINGDOG_API_KEY !== "your_scrapingdog_api_key"),
      },
    });
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
