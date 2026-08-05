<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Flux

Recruiting platform (Next.js 15 + Supabase, Shiprocket-branded, internally
"Reqr"). Recruiters source and screen candidates; candidates apply, take
assessments, and sit **AI voice interviews**.

## Read these before changing anything

| doc | when |
|---|---|
| `docs/ai-interviews.md` | the voice interview platform — pipeline, contracts, models |
| `docs/database.md` | Supabase, running SQL against prod, schema drift, the RLS traps |
| `docs/deployment.md` | the POC EC2 box, subdomain routing, CI/CD, manual deploys |

## Two runtimes, not one

- **The Next.js app** — everything under `src/`.
- **`gateway/`** — a standalone Node WebSocket service for the voice pipeline.
  It exists because Vercel cannot hold a socket open. It is a separate npm
  project with its own `package.json`, deps, and `.env`; the root `tsconfig.json`
  excludes it. `npm run gateway` runs it locally.

`src/lib/interview-types.ts` and `gateway/src/types.ts` are the shared contract
and are **kept in sync by hand**. Change one, change the other.

## Where it runs

Production for this work is the shared POC EC2 box, at
**https://jisha.ai-rocket-experiments.com** — not Vercel. It shares that box
and IP with other POCs, isolated by nginx `server_name`. The repo also has a
GitHub `origin` and a Vercel deployment from earlier work; the CI/CD pipeline
sources from **CodeCommit**. Don't assume Vercel is the target.

## House rules learned the hard way

- **Claude 5 thinks adaptively.** Never read `response.content[0]` for text —
  filter for text blocks and join them. This silently broke two features.
- **Public API routes that insert must use `createServiceClient()`.** `anon`
  can INSERT but not SELECT, so `insert().select()` trips RLS. Adding an anon
  SELECT policy would leak the whole table — don't.
- **Any new table needs RLS enabled explicitly.** Two shipped without it and
  were publicly readable, including OAuth refresh tokens.
- **Never run `npm run build` while `next dev` is running** on the same
  checkout — the production build overwrites `.next` and dev starts 500ing on
  missing chunks. It looks exactly like a code regression.
- Derive a value in **one** place. The report's tier labels and verdict come
  from `tierForScore`/`verdictForPercent`; the sample reports we copied had
  contradictory labels precisely because that logic was duplicated.
- `NEXT_PUBLIC_*` values are inlined at **build** time. Changing one on a
  server means rebuild, not restart.

## Verify against reality

This codebase has drifted from its schema before, in ways that produced no
visible error. When touching data paths, check the actual deployed schema
(`docs/database.md` shows how) rather than trusting `supabase-schema.sql`,
which is stale. Prefer exercising the real endpoint over reasoning about it.
