# AI Web Interviews — local runbook

Automated first-round voice interviews: recruiter creates a link → candidate
talks to an AI interviewer in the browser → a Hyr-format assessment report
lands in the dashboard.

## One-time setup

1. **Database** — run `supabase/ai-interviews.sql` in the Supabase SQL editor
   (creates `ai_interviews`, `ai_interview_turns`, and the two private storage
   buckets `interview-recordings` / `interview-photos`).

2. **Env** — create `.env.local` at the repo root with Supabase + Anthropic
   keys, then add:

   ```env
   SARVAM_API_KEY=...                                # same key rocketizer uses
   NEXT_PUBLIC_INTERVIEW_GATEWAY_URL=http://localhost:8787
   ```

   The gateway reads the root `.env.local` too (see `gateway/.env.example` for
   optional overrides — models, voice, port).

3. **Gateway deps** — `cd gateway && npm install` (already done if you cloned
   with it built).

## Running locally

```bash
npm run dev        # Next.js app on :3000
npm run gateway    # voice gateway on :8787 (separate terminal)
```

## Flow

1. Dashboard → **AI Interviews** tab → New interview → pick candidate + JD,
   language (en-IN / hi-IN), duration → create → copy link or email invite.
2. Candidate opens `/interview/<token>`: welcome + consent → camera/mic/speaker
   check → identity snapshot → hands-free voice interview (open mic, natural
   barge-in) → done screen.
3. Gateway generates the interview blueprint from JD+CV on first connect,
   conducts sectioned adaptive questioning, persists every turn, records the
   full two-sided video, then runs the evaluation (claude-opus-5).
4. Report appears at `/employer/report/<id>` (dashboard links it when status
   is `evaluated`). Print → PDF from the report toolbar.

## Useful endpoints (gateway)

- `GET  :8787/health` — liveness
- `POST :8787/evaluate/<token>` — re-run a failed/stuck evaluation for a
  completed interview

## Architecture notes

- Voice loop: browser worklet (16 kHz PCM16) → WS → server energy-VAD →
  Sarvam streaming STT → Claude (streamed, sentence-chunked) → Sarvam
  streaming TTS → scheduled PCM playback. First audio typically lands
  ~1.5–2 s after the candidate stops speaking.
- The pipeline modules are ports of rocketizer-mono's proven voice stack.
- Shared types: `src/lib/interview-types.ts` ⇄ `gateway/src/types.ts` (keep in
  sync).
- If a candidate drops mid-interview, reopening the link resumes where they
  left off (turns are persisted; status stays `in_progress`).
