# AI Web Interviews

Automated first-round voice interviews: a recruiter creates a link → the
candidate talks to an AI interviewer in the browser → a Hyr-format assessment
report lands in the dashboard.

Live at **https://jisha.ai-rocket-experiments.com** (see `deployment.md`).

## Shape of the thing

```
browser  ── AudioWorklet, 16 kHz PCM16 ──►  voice gateway (Node, :8787)
   ▲          (only while the mic is open —            │
   │           the candidate taps to talk)             │
   │                                              ▼
   │                                   Sarvam streaming STT (saarika:v2.5)
   │                                              ▼
   │                                   Claude (streamed, sentence-chunked)
   └──── scheduled PCM playback ◄──── Sarvam streaming TTS (bulbul:v3, "ritu")
```

There is deliberately **no realtime speech model**. This is a discrete
STT → LLM → TTS pipeline ported from the proven stack in `rocketizer-mono`
(`packages/ai/src/audio-stream.ts`, `packages/api/src/server/gateway/*`). When
tuning latency or echo behaviour, read that repo first — the tricks below all
came from there.

The gateway is a **separate Node process**, not a Next.js route, because
Vercel cannot hold a WebSocket open. It runs beside `next dev` locally and as
its own systemd unit in production.

### The mic is push-to-talk, and that is load-bearing

The candidate taps **Tap to speak** to take the floor and taps again to send.
Between taps the browser sends no audio at all and the gateway listens to
nothing. There is **no voice-activity detection anywhere in the pipeline.**

This replaced an open-mic build with a server-side energy VAD, which failed in
a way worth remembering: room noise — and the interviewer's own TTS leaking
back through the candidate's speakers — tripped `speech_start`, which cancelled
the question that was still being generated. The interviewer would appear to
skip questions, answer itself, or transcribe coughs as answers. Any future
"just add automatic turn detection" idea has to solve that first.

Consequences that hold today:

- `mic_open` / `mic_close` frames bracket every candidate turn; STT flushes on
  `mic_close`, never on silence.
- Tapping while the interviewer is speaking is a deliberate barge-in — the only
  way a turn gets interrupted.
- The client withholds the "your turn" state until scheduled TTS playback has
  actually drained, so the button never goes live over the tail of a question.
- A tap that captured no voiced audio returns `no_speech` instead of sending an
  empty turn to the model.

### Why it feels fast

First audio lands ~1.5–2 s after the candidate sends their answer, because the
pipeline never waits for a whole turn to finish:

- `SentenceChunker` (`gateway/src/voice-chunker.ts`) emits the first fragment
  after ~18 characters, so TTS starts while Claude is still generating.
- STT and TTS sockets are prewarmed.

Sarvam quirk worth knowing: **a flushed TTS socket cannot be reused.** Drop it
and open a new one.

## Interview flow

1. Dashboard → **AI Interviews** → New interview → candidate + JD, language
   (`en-IN` / `hi-IN`), duration → creates a row and a shareable token link.
2. Candidate opens `/interview/<token>`: consent → camera/mic/speaker check →
   identity snapshot → push-to-talk interview → done screen.
3. On first connect the gateway generates a **blueprint** from the JD + CV
   (sections with minutes and probes, 8 competencies, role level), then
   conducts the interview against it, persisting every turn.
4. On completion it runs the evaluation and writes an `InterviewReport`.
5. Report renders at `/employer/report/<id>`; print to PDF from the toolbar.

Both sides of the conversation are recorded: the camera track is mixed with
mic + TTS playback through a `MediaStreamAudioDestinationNode`, and
`MediaRecorder` POSTs 10-second chunks to the gateway, which finalises them to
Supabase Storage.

**Interruptions are safe.** Turns are persisted as they happen and the status
stays `in_progress`, so reopening the link resumes: the interviewer welcomes
the candidate back and repeats the last question.

## Contracts

`src/lib/interview-types.ts` is the source of truth — the WebSocket protocol,
`InterviewReport`, the HYR palette, and the tier/verdict thresholds.
`gateway/src/types.ts` mirrors it and **must be kept in sync by hand**.

Two derivations exist in exactly one place each, `tierForScore` and
`verdictForPercent`. The sample PDFs we worked from had the same 9.5 labelled
both "Exceptional" and "STRONG" because that logic lived in two places; do not
reintroduce a second copy.

The interviewer emits control markers `[SECTION:<id>]` and `[END_INTERVIEW]`
inline. `MarkerFilter` strips them before anything reaches captions or TTS, and
handles a marker split across streaming deltas.

## Models

Configurable via env, defaulting to `claude-sonnet-5` for the blueprint and the
live turns, and `claude-opus-5` for evaluation (the quality-critical step).

**Claude 5 thinks adaptively**, so a response may lead with a thinking block:
never read `content[0]` for text — join every text block. Getting this wrong
broke blueprint generation and evaluation in two separate places.

Blueprint generation retries twice and then falls back to a generic-but-valid
plan, so a malformed JSON response degrades the interview instead of killing
it. `extractJson` scans for balanced braces respecting string literals, so
trailing prose or a ```json fence cannot corrupt the parse.

## Database

`ai_interviews` + `ai_interview_turns` (`supabase/ai-interviews.sql`), plus two
private storage buckets `interview-recordings` and `interview-photos`. The
pre-existing `interviews` table is unrelated — it holds calendar-scheduled
human interviews.

## Local development

```bash
npm run dev        # app on :3000
npm run gateway    # voice gateway on :8787
```

Needs `.env.local` with the Supabase keys, `ANTHROPIC_API_KEY`,
`SARVAM_API_KEY`, and `NEXT_PUBLIC_INTERVIEW_GATEWAY_URL=http://localhost:8787`.
For a fully offline stack (local Postgres + seeded data) see
`supabase/local-bootstrap.sql` and `supabase/seed-demo-interviews.sql`.

## Useful endpoints

- `GET  /gw/health` — gateway liveness
- `POST /gw/evaluate/<token>` — re-run a failed or stuck evaluation without
  redoing the interview
