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
        (binary WS frames, 16 kHz)
```

There is deliberately **no realtime speech model**. This is a discrete
STT → LLM → TTS pipeline ported from the proven stack in `rocketizer-mono`
(`packages/ai/src/audio-stream.ts`, `packages/api/src/server/gateway/*`). When
tuning latency or echo behaviour, read that repo first — the tricks below all
came from there.

The gateway is a **separate Node process**, not a Next.js route, because
Vercel cannot hold a WebSocket open. It runs beside `next dev` locally and as
its own systemd unit in production.

### Taking the floor is manual; releasing it is not

The candidate taps **Tap to speak** to take the floor. Between turns the browser
sends no audio at all and the gateway listens to nothing. **Only a tap ever
takes the floor** — that part is load-bearing.

It replaced an open-mic build with a server-side energy VAD, which failed in a
way worth remembering: room noise — and the interviewer's own TTS leaking back
through the candidate's speakers — tripped `speech_start`, which cancelled the
question that was still being generated. The interviewer would appear to skip
questions, answer itself, or transcribe coughs as answers.

Releasing the floor *is* automatic: the browser ends the turn after ~1.5 s of
trailing silence (`SILENCE_FRAMES_TO_END` in `use-interview-stream.ts`), and the
send button fills as a countdown so it never feels like a cut-off. This is safe
precisely because it can only run while the mic is open, which only happens on a
deliberate tap — so the interviewer is never speaking and there is no echo to
mistake for speech. It exists because waiting for a second tap cost a full human
reaction time on *every* turn, which no latency measurement ever showed.

Consequences that hold today:

- `mic_open` / `mic_close` frames bracket every candidate turn; STT flushes on
  `mic_close`, never on silence at the gateway.
- Tapping while the interviewer is speaking or thinking is a deliberate barge-in
  — the only way a turn gets interrupted.
- Auto-send arms only after `MIN_VOICED_FRAMES` of real speech, so an open mic
  in a silent room waits for the tap rather than firing an empty turn.
- The client withholds the "your turn" wording until scheduled TTS playback has
  actually drained, so the label never goes live over the tail of a question.
- A tap that captured no voiced audio returns `no_speech` instead of sending an
  empty turn to the model.
- Re-opening the mic while the previous turn's STT flush is still in flight is
  safe. `SignalQueue` carries a generation counter that `reset()` bumps, so the
  stale flush cannot consume the *new* utterance's first segment — which used to
  cost the candidate the opening words of the answer they had just started, and
  looked exactly like a transcription fault.

### Why it feels fast

Nothing in the turn waits for the stage before it to finish:

- `SentenceChunker` (`gateway/src/voice-chunker.ts`) emits the first fragment
  after ~18 characters, so TTS starts while Claude is still generating.
  **Sarvam's `min_buffer_size` floor is 30** — anything lower is rejected with a
  422 and TTS goes completely silent, which previously surfaced only as a 20 s
  flush timeout. So the first fragment does wait for a second one; at streaming
  speed that costs tens of milliseconds. This is not a knob to lower.
- **Thinking is disabled on live turns.** Adaptive thinking is on by default on
  Claude 5 and its tokens are silent, so nothing reached TTS until the model
  finished deliberating over a 40-word question.
- **The system prompt and the conversation are prompt-cached**, with a fixed
  breakpoint on the system block and a second one that walks forward with the
  last message.
- STT and TTS sockets are prewarmed, and the model request no longer waits on
  the TTS handshake — `ensureTts` assigns the session synchronously, so only
  `speak()` needs the socket.
- The browser connects during the device check, so the blueprint, STT and TTS
  are all warm before the room renders. The blueprint itself is normally
  generated at link creation (`POST /prepare/:token`).

**Prewarm on a 60-second clock.** Sarvam closes any socket that has received
nothing for 60 s, with an `error` frame carrying code 408 — measured, not
guessed. That makes prewarm a matter of *when*, not *more*: a TTS socket opened
when the candidate starts answering is usually dead by the time they finish, so
the reply pays the reconnect anyway and logs a 408 that reads like a fault.
TTS is therefore warmed at `mic_close`, when the reply is seconds away, and
**not** at `mic_open` or at the end of the previous turn. `ensureTts` re-warms an
existing session rather than returning early, so a reaped socket is revived
ahead of the reply instead of during it.

Every Sarvam connect is capped at 4 s. `ensureConnected` hands the same
in-flight promise to every caller, so one hung handshake parks every queued
`speak()` behind it — including a fire-and-forget prewarm whose stall the next
turn then silently inherits.

And when it isn't fast, it doesn't sound dead: a bank of short acknowledgements
("Got it.", "Right.") is synthesized once per session and one plays the instant
the turn is handed back, covering the STT + LLM + TTS gap the way a human
interviewer would. The bank is warmed at **connect**, while the candidate is
still on the device check. Warming it after the greeting instead put six
sequential Sarvam handshakes in the same window as the first real answer.

**`speaking` means audible.** The status is emitted on the first PCM byte that
reaches the socket, not when text is handed to TTS. Announcing it at queue time
meant the candidate watched a speaking indicator through however long synthesis
took — and if TTS then failed outright, the turn had claimed to speak and never
did. A turn that produces no audio now stays `thinking` until `audio_done`.

**Measure, don't guess.** Every turn logs one line:

```
[turn] first_audio=980ms filler=3ms stt_flush=310ms first_token=620ms llm_done=streaming
[llm]  ttft=590ms total=1240ms in=42 cache_read=3180 cache_write=0 out=38 stop=end_turn
```

`llm_done=streaming` is the healthy case — TTS started before the model
finished. A number there means audio only began afterwards, and the gap to
`first_audio` is time spent purely in TTS; without that split a slow socket and
a slow model look identical. `cache_read=0` across consecutive turns means
something is invalidating the prefix — that is a bug, not a tuning opportunity.

Sarvam quirks worth knowing: **a flushed TTS socket cannot be reused** (drop it
and open a new one), and interviewer audio goes down the socket as **binary**
frames — an 8-byte `[uint32 seq][uint32 sampleRate]` header then raw PCM16LE.
Base64-in-JSON cost a third more bytes on the heaviest stream on the wire.

## Interview flow

1. Dashboard → **AI Interviews** → New interview → candidate + JD, language
   (`en-IN` by default, with `hi-IN` as an explicit choice), duration → creates
   a row and a shareable token link.
2. Candidate opens `/interview/<token>`: consent → camera/mic/speaker check →
   identity snapshot → push-to-talk interview → done screen.
3. Creating the link fires `POST /prepare/:token` at the gateway, which
   generates the **blueprint** from the JD + CV (sections with minutes and
   probes, 8 competencies, role level) in the background. The session
   regenerates it on connect if that never landed; `ensureBlueprint` dedupes the
   two paths so a candidate arriving mid-generation joins it rather than paying
   for a second one.
4. On completion it runs the evaluation and writes an `InterviewReport`.
5. Report renders at `/employer/report/<id>`; print to PDF from the toolbar.

The first greeting and reconnect greeting are scripted from
`ai_interviews.candidate_name`, not generated from CV context. That canonical
name also wins over any stale name submitted alongside a selected candidate id.
Manual and overtime endings use a scripted thank-you, and the browser waits for
its local playback queue to drain before stopping the recorder.

Both sides of the conversation are recorded: the camera track is mixed with
mic + TTS playback through a `MediaStreamAudioDestinationNode`, and
`MediaRecorder` POSTs 10-second chunks to the gateway, which finalises them to
the private `interview-recordings` Supabase Storage bucket. The DB stores the
object path in `ai_interviews.video_path`; the authenticated recording route
mints a one-hour signed URL for recruiter playback from either the dashboard or
report. Recording objects are never public.

### Integrity signals

Once the interview starts, the browser records tab-hidden durations, switches
to another window, and exits from interview fullscreen. The gateway also notes
answer breaks of at least 60 seconds. These append to `ai_interview_turns` as
structured `system` turns, avoiding a second schema/runtime dependency while
preserving an auditable event ledger in Supabase.

Evaluation derives an integrity score deterministically. The job-fit score is
kept separately as `content_percent`; integrity can only deduct points, and the
overall deduction is capped at 20. The report shows the raw counts, durations,
score math, and a clear caveat that focus signals do not prove misconduct.

Candidates are told about this monitoring before consent. Browser APIs reveal
only focus state and time away — never the contents of another tab or app.

### Language and privacy guardrails

New links default to English and the API falls back to `en-IN` for any missing
or unsupported value. English sessions are hard-locked to English in the live
prompt rather than following a candidate into another language. Bulbul v3 uses
the `priya` voice by default unless `SARVAM_TTS_VOICE` overrides it.

Blueprints, live turns and evaluation are all instructed to use only job-related
JD/CV/experience evidence. The interviewer must never request passwords, OTPs,
government IDs, bank/card details, contact details, exact addresses, medical
information, protected-characteristic data, or salary-account details. A narrow
transcript guard also redacts obvious emails, Indian phone numbers, PAN/Aadhaar
formats, and passcodes if a candidate volunteers them.

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
live turns, and `claude-opus-5` for evaluation (the quality-critical step, and
off the latency path entirely).

**Claude 5 thinks adaptively**, so a response may lead with a thinking block:
never read `content[0]` for text — join every text block. Getting this wrong
broke blueprint generation and evaluation in two separate places.

Live turns pass `thinking: {type: "disabled"}` with `effort: "low"`. Adaptive
thinking is what you get by *omitting* the parameter on Claude 5, and it cost us
twice here: the tokens are silent, so first audio waited on them, and
`max_tokens` caps thinking and reply text **together** — a turn that deliberated
past the 400-token cap came back with no text block at all. That is the empty
interviewer turn `runTurn` still defends against. Do not re-enable thinking on
the live path without raising `max_tokens` well clear of it.

The blueprint and the evaluation both keep adaptive thinking: they are one-shot,
quality-critical, and nobody is listening to silence while they run.

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
Set `INTERVIEW_GATEWAY_URL` too if the app should reach the gateway on a
different (e.g. internal) address than the browser does — blueprint prewarming
is server-to-server.
For a fully offline stack (local Postgres + seeded data) see
`supabase/local-bootstrap.sql` and `supabase/seed-demo-interviews.sql`.

## Useful endpoints

- `GET  /gw/health` — gateway liveness
- `POST /gw/prepare/<token>` — generate the blueprint ahead of time. Answers
  `202` immediately and generates in the background; safe to call repeatedly.
  The app fires this when a recruiter creates the link.
- `POST /gw/evaluate/<token>` — re-run a failed or stuck evaluation without
  redoing the interview
