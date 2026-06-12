import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const ext = file.name.split(".").pop()?.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    if (ext === "txt") {
      return NextResponse.json({ text: await file.text() });
    }

    if (ext === "docx" || ext === "doc") {
      const result = await mammoth.extractRawText({ buffer });
      return NextResponse.json({ text: result.value });
    }

    if (ext === "xlsx" || ext === "xls") {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const text = workbook.SheetNames
        .map(name => XLSX.utils.sheet_to_txt(workbook.Sheets[name]))
        .join("\n\n");
      return NextResponse.json({ text });
    }

    if (ext === "pdf") {
      const base64 = buffer.toString("base64");
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64 },
            } as Anthropic.DocumentBlockParam,
            {
              type: "text",
              text: "Extract all text from this job description document. Return only the extracted text, preserving structure.",
            },
          ],
        }],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      return NextResponse.json({ text });
    }

    return NextResponse.json(
      { error: "Unsupported file type. Upload a PDF, Word (.doc/.docx), Excel (.xls/.xlsx), or .txt file." },
      { status: 400 }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to parse file" }, { status: 500 });
  }
}
