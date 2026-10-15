import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const { prompt } = await request.json();
  if (!prompt) return new Response("Missing prompt", { status: 400 });

  const stream = anthropic.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: `Generate a compelling, well-structured job description for a tech role at Shiprocket (India's leading logistics platform) based on this: "${prompt}"

Include these sections with markdown headers:
## About the Role
## What You'll Do
- 5-7 responsibility bullets
## What We're Looking For
- Must-have requirements
- Nice-to-have
## Why Join Shiprocket
- 2-3 compelling reasons

Write plainly and specifically. Every line should tell an engineer something concrete about the work, the team, or the expectations. Avoid marketing language, em dashes, and filler.`,
    }],
  });

  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          controller.enqueue(new TextEncoder().encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
