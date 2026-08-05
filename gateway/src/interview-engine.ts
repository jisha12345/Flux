/**
 * The interview brain: blueprint generation, the live interviewer persona, and
 * the streaming turn runner.
 *
 * Control markers — the model embeds these in its replies; MarkerFilter strips
 * them before any text reaches captions or TTS:
 *   [SECTION:<id>]     at the very start of a reply that begins a new section
 *   [END_INTERVIEW]    at the very end of the closing reply
 */
import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";
import type { AiInterviewRow, InterviewBlueprint } from "./types.js";

export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export const PERSONA_NAME = "Aria";

const LANGUAGE_NAMES: Record<string, string> = {
  "en-IN": "English",
  "hi-IN": "Hindi (respond in conversational Hindi, Devanagari script; English technical terms are fine)",
  "bn-IN": "Bengali",
  "ta-IN": "Tamil",
  "te-IN": "Telugu",
  "kn-IN": "Kannada",
  "ml-IN": "Malayalam",
  "mr-IN": "Marathi",
  "gu-IN": "Gujarati",
  "pa-IN": "Punjabi",
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? "English";
}

/** Pulls the first complete JSON object out of a model reply. Scans for
 *  balanced braces while respecting string literals and escapes, so trailing
 *  commentary or a ```json fence can't corrupt the parse. */
export function extractJson<T>(text: string): T {
  const body = text.replace(/```(?:json)?/gi, "");
  const start = body.indexOf("{");
  if (start === -1) throw new Error("No JSON object in model output");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i += 1) {
    const ch = body[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(body.slice(start, i + 1)) as T;
    }
  }
  // Unbalanced (usually a truncated reply) — let JSON.parse report the detail.
  return JSON.parse(body.slice(start)) as T;
}

// ── Blueprint ───────────────────────────────────────────────────────────────

/** Last-resort plan so a blueprint hiccup never costs the candidate their
 *  interview — generic but correctly shaped and time-boxed to the booking. */
function fallbackBlueprint(row: AiInterviewRow): InterviewBlueprint {
  const total = row.duration_minutes;
  const body = Math.max(3, Math.round((total - 5) / 4));
  return {
    role_level: "mid",
    sections: [
      { id: "intro", title: "Introduction", minutes: 2, probes: ["current scope and responsibilities"] },
      { id: "experience", title: "Experience Deep Dive", minutes: body, probes: ["most significant recent project", "their specific contribution and its measurable outcome"] },
      { id: "technical", title: "Role-Specific Depth", minutes: body, probes: [`core skills for ${row.role_title}`, "a decision they made and the trade-offs they weighed"] },
      { id: "scenario", title: "Problem-Solving Scenario", minutes: body, probes: ["how they approach an ambiguous problem in this domain"] },
      { id: "ownership", title: "Ownership & Collaboration", minutes: body, probes: ["working with others", "a time they raised the bar"] },
      { id: "candidate_questions", title: "Your Questions", minutes: 3, probes: ["what the candidate wants to know"] },
    ],
    competencies: [
      "Role Knowledge", "Depth of Experience", "Problem Solving", "Communication",
      "Ownership", "Collaboration", "Impact & Results", "Growth Mindset",
    ],
    candidate_context: row.cv_text?.slice(0, 600) ?? `Candidate: ${row.candidate_name}.`,
    role_context: row.jd_text?.slice(0, 600) ?? `Role: ${row.role_title} at ${row.company_name}.`,
    persona_name: PERSONA_NAME,
  };
}

export async function generateBlueprint(row: AiInterviewRow): Promise<InterviewBlueprint> {
  // Two attempts: model output is occasionally malformed JSON, and losing the
  // blueprint means losing the interview.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestBlueprint(row);
    } catch (err) {
      lastError = err;
      console.error(`[blueprint] attempt ${attempt + 1} failed:`, err);
    }
  }
  console.error(`[blueprint] falling back to the generic plan for ${row.id}:`, lastError);
  return fallbackBlueprint(row);
}

async function requestBlueprint(row: AiInterviewRow): Promise<InterviewBlueprint> {
  const response = await anthropic.messages.create({
    model: env.BLUEPRINT_MODEL,
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: `Design a structured ${row.duration_minutes}-minute first-round AI interview blueprint.

ROLE: ${row.role_title} at ${row.company_name}

JOB DESCRIPTION:
${row.jd_text ?? "(not provided — infer typical expectations for this role title)"}

CANDIDATE PROFILE / CV:
${row.cv_text ?? `(not provided — candidate name: ${row.candidate_name})`}

Produce a JSON blueprint:
{
  "role_level": "executive" | "senior" | "mid" | "junior",
  "sections": [
    { "id": "intro", "title": "Introduction", "minutes": 2, "probes": ["..."] },
    { "id": "experience", "title": "...", "minutes": N, "probes": ["...", "..."] },
    ...4-6 sections total, ending with { "id": "candidate_questions", "title": "Your Questions", "minutes": 3, "probes": [...] }
  ],
  "competencies": ["...", ×8],
  "candidate_context": "3-4 sentence synthesis of the candidate's background relevant to this role",
  "role_context": "3-4 sentence synthesis of what this role needs and what great looks like"
}

Rules:
- Section minutes must sum to roughly ${row.duration_minutes}.
- "probes" are specific areas to dig into for THIS candidate against THIS JD (reference their actual companies/projects when the CV allows), 2-4 per section.
- Middle sections should cover: their concrete experience, role-specific technical/domain depth, one problem-solving scenario grounded in the role, and values/ownership.
- "competencies" are exactly 8 role-specific competency names that a hiring committee would score for this role (these become the report scorecard).
- Probe only job-related capability. Never include probes about age, gender, religion, caste, marital status, family plans, health, or other protected characteristics.

Respond with ONLY the JSON object.`,
      },
    ],
  });

  // Claude 5 thinks adaptively — the reply may lead with a thinking block, so
  // collect every text block rather than assuming content[0] is the answer.
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  const parsed = extractJson<Omit<InterviewBlueprint, "persona_name">>(text);
  const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
  if (sections.length < 3) throw new Error("Blueprint has too few sections");
  return {
    ...parsed,
    competencies: (parsed.competencies ?? []).slice(0, 8),
    persona_name: PERSONA_NAME,
  };
}

// ── Live interviewer ────────────────────────────────────────────────────────

export function buildSystemPrompt(row: AiInterviewRow, blueprint: InterviewBlueprint): string {
  const sectionPlan = blueprint.sections
    .map(
      (s, i) =>
        `${i + 1}. [id: ${s.id}] ${s.title} (~${s.minutes} min)\n   Probe areas: ${s.probes.join("; ")}`,
    )
    .join("\n");

  return `You are ${blueprint.persona_name}, a warm, sharp, professional interviewer conducting a ${row.duration_minutes}-minute first-round interview on behalf of ${row.company_name} for the role of ${row.role_title}. The candidate is ${row.candidate_name}.

ROLE CONTEXT: ${blueprint.role_context}

CANDIDATE CONTEXT: ${blueprint.candidate_context}

INTERVIEW PLAN (follow in order):
${sectionPlan}

VOICE RULES — everything you write is spoken aloud by TTS:
- Natural spoken ${languageName(row.language)}. Contractions, warm and human. No markdown, no bullet points, no emoji, no stage directions, no text formatting of any kind.
- Keep every turn short: a brief, varied acknowledgment of what they said, then exactly ONE question. Stay under 40 words, except the opening greeting and the final wrap-up.
- Numbers, when spoken, read naturally.

INTERVIEWING RULES:
- Work through the plan's probe areas conversationally — never read them out like a checklist.
- When an answer is vague, generic, or unusually interesting, dig deeper — but at most two follow-ups, then move on.
- Never evaluate aloud, never praise or criticise performance, never coach, never reveal impressions or scores. Say "thanks, that's helpful" — not "great answer".
- Don't answer interview questions for them. If they ask about the role or company, answer briefly from the role context, then steer back.
- If they go off-topic or say something inappropriate, redirect politely.
- If a transcription seems garbled or you didn't catch it, ask them naturally to repeat.
- Evaluate and probe ONLY job-related competencies. Never ask about age, gender, religion, caste, marital/family status, health, or any other protected characteristic — even indirectly.
- If the candidate switches language, follow them naturally.

SYSTEM NOTES: user turns may begin with a bracketed [state: ...] or [note: ...] line. These come from the system, not the candidate — obey notes (e.g. move to the next section, begin wrapping up) smoothly in your reply, and never mention them.

CONTROL MARKERS (stripped before speech — the candidate never sees them; never mention them):
- When a reply begins a new section of the plan, start the reply with [SECTION:<id>] using the section id from the plan. Your very first greeting starts with [SECTION:intro].
- Your final reply — thank them, tell them the ${row.company_name} team will review and be in touch about next steps — must end with [END_INTERVIEW].`;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamTurnOptions {
  system: string;
  history: HistoryMessage[];
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}

/** Stream one interviewer turn; resolves with the full raw text (markers included). */
export async function streamTurn(options: StreamTurnOptions): Promise<string> {
  const stream = anthropic.messages.stream(
    {
      model: env.INTERVIEW_MODEL,
      max_tokens: 400,
      system: options.system,
      messages: options.history,
    },
    { signal: options.signal },
  );
  stream.on("text", (delta) => options.onDelta(delta));
  const final = await stream.finalMessage();
  return final.content[0]?.type === "text" ? final.content[0].text : "";
}

// ── Marker filter ───────────────────────────────────────────────────────────

const MARKER_MAX = 40;
const SECTION_RE = /^\[SECTION:([a-z0-9_-]+)\]/i;
const END_RE = /^\[END_INTERVIEW\]/i;
const SECTION_PREFIX_RE = /^\[(?:S(?:E(?:C(?:T(?:I(?:O(?:N(?::[a-z0-9_-]*)?)?)?)?)?)?)?)?$/i;
const END_PREFIX_RE = /^\[(?:E(?:N(?:D(?:_(?:I(?:N(?:T(?:E(?:R(?:V(?:I(?:E(?:W)?)?)?)?)?)?)?)?)?)?)?)?)?$/i;

export interface MarkerCallbacks {
  onSection?: (id: string) => void;
  onEnd?: () => void;
}

/**
 * Streams text through while intercepting control markers, which may arrive
 * split across many deltas. Holds back only text that could still become a
 * marker; everything else flows immediately.
 */
export class MarkerFilter {
  private buf = "";

  constructor(
    private readonly emit: (text: string) => void,
    private readonly callbacks: MarkerCallbacks,
  ) {}

  feed(delta: string): void {
    this.buf += delta;
    this.drain(false);
  }

  flush(): void {
    this.drain(true);
    if (this.buf) {
      this.emit(this.buf);
      this.buf = "";
    }
  }

  private drain(final: boolean): void {
    while (this.buf.length > 0) {
      const open = this.buf.indexOf("[");
      if (open === -1) {
        this.emit(this.buf);
        this.buf = "";
        return;
      }
      if (open > 0) {
        this.emit(this.buf.slice(0, open));
        this.buf = this.buf.slice(open);
      }
      // buf now starts with "["
      const section = this.buf.match(SECTION_RE);
      if (section) {
        this.callbacks.onSection?.(section[1].toLowerCase());
        this.buf = this.buf.slice(section[0].length).replace(/^\s+/, "");
        continue;
      }
      if (END_RE.test(this.buf)) {
        this.callbacks.onEnd?.();
        this.buf = this.buf.slice(this.buf.match(END_RE)![0].length);
        continue;
      }
      const couldBeMarker =
        this.buf.length <= MARKER_MAX &&
        (SECTION_PREFIX_RE.test(this.buf) || END_PREFIX_RE.test(this.buf));
      if (couldBeMarker && !final) return; // wait for more deltas
      // Not a marker — release the "[" and keep scanning after it.
      this.emit("[");
      this.buf = this.buf.slice(1);
    }
  }
}
