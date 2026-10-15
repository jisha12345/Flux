# Reqr

AI-powered tech recruiting platform by Shiprocket. Recruiters source and screen
candidates; candidates apply, take assessments, and sit **AI voice interviews**
that produce a full written assessment report.

## Running locally

```bash
npm install
npm run dev        # app       → http://localhost:3000
npm run gateway    # voice gateway → :8787   (separate terminal)
```

The gateway is only needed for AI interviews. It is a **separate Node service**
(`gateway/`) with its own dependencies, because the voice pipeline needs a
long-lived WebSocket.

Create `.env.local` with the Supabase keys, `ANTHROPIC_API_KEY`,
`SARVAM_API_KEY`, and `NEXT_PUBLIC_INTERVIEW_GATEWAY_URL=http://localhost:8787`.
To work entirely offline, `supabase start` then apply
`supabase/local-bootstrap.sql` and `supabase/seed-demo-interviews.sql`.

## Deployed

**https://jisha.ai-rocket-experiments.com** — on the shared POC EC2 box, not
Vercel. Push to the CodeCommit `main` remote to deploy, or run
`./scripts/deploy-poc.sh` for a manual push from working state.

## Docs

| | |
|---|---|
| [`docs/ai-interviews.md`](docs/ai-interviews.md) | the voice interview platform: STT→LLM→TTS pipeline, contracts, models |
| [`docs/database.md`](docs/database.md) | Supabase access, migrations, schema drift, the RLS traps |
| [`docs/deployment.md`](docs/deployment.md) | hosting, subdomain routing, CI/CD, secrets |
| [`AGENTS.md`](AGENTS.md) | conventions and hard-won gotchas — read before changing code |
