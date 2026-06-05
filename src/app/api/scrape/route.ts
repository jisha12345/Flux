import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

    const wsUrl = process.env.PLAYWRIGHT_WS_URL;
    if (!wsUrl) return NextResponse.json({ error: "Playwright not configured" }, { status: 503 });

    // Connect to remote Playwright instance and scrape the URL
    const { chromium } = await import("playwright");
    const browser = await chromium.connect(wsUrl);
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    const content = await page.content();
    const text = await page.evaluate(() => document.body.innerText);
    await browser.close();

    return NextResponse.json({ content, text });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Scrape failed" }, { status: 500 });
  }
}
