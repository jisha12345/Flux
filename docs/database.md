# Database

Supabase project **`dagdanwfyjawsihdgnri`** (ap-northeast-1). Production holds
real data — ~3,900 candidate rows — so treat every migration as additive.

## Running SQL against production

There is no direct psql access. Use the Management API with a personal access
token (`sbp_…`):

```bash
printf '%s' '{"query":"select 1"}' > /tmp/q.json
curl -s -X POST \
  "https://api.supabase.com/v1/projects/dagdanwfyjawsihdgnri/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" --data @/tmp/q.json
```

Use **curl**, not Python's `urllib` — the latter's default user-agent is
Cloudflare-blocked and returns a bare 403. API keys can be read with
`GET /v1/projects/{ref}/api-keys?reveal=true`; the project uses the newer
`sb_publishable_` / `sb_secret_` key format.

For offline work, `supabase start` plus `supabase/local-bootstrap.sql`
reproduces the whole schema locally. Tables created that way get no PostgREST
grants automatically, so follow with `GRANT ALL … TO anon, authenticated,
service_role` and `NOTIFY pgrst, 'reload schema'`.

## Migrations in this repo

| file | purpose |
|---|---|
| `supabase/ai-interviews.sql` | `ai_interviews`, `ai_interview_turns`, storage buckets |
| `supabase/fix-schema-drift.sql` | repairs the drift described below (already applied) |
| `supabase/local-bootstrap.sql` | full schema for a local stack |
| `supabase/seed-demo-interviews.sql` | sample JDs, candidates, ready-to-run interviews |

## The schema drift, and why it matters

The deployed schema had fallen behind the code, and several routes had been
failing silently in production. `fix-schema-drift.sql` repaired it:

- `candidates` was missing `skills`, `answers`, `ai_score`, `ai_summary`,
  `ai_dimensions`, `voice_screen`, `job_id` — i.e. **every column
  `/api/apply` writes**. The public application form was completely broken.
- `jobs` was missing `company`, `location`, `skills`, `requirements`,
  `salary_range`, which `/api/jd` and `/api/source-profiles` select by name,
  so those queries errored outright.
- `assessment_submissions` and `twenty2_calls` **did not exist at all**.
  Candidate assessment submissions were being lost; call logs were discarded
  silently because that insert swallows its errors.
- CHECK constraints rejected values the app legitimately writes: `status` was
  lowercase-only while the app writes `"Applied"`/`"Shortlisted"`, and
  `assessment_type` had no `'screening'`.

**`candidates.full_name` is the canonical name column** and is `NOT NULL`.
Code that wrote `name` failed; it now writes `full_name`, and the two routes
that selected `name` use the PostgREST alias `name:full_name` so their JSON
shape is unchanged. `candidates.jd_id` exists but nothing writes it — `job_id`
is the live one.

If you add a column the app needs, add it to **both** `fix-schema-drift.sql`
and `local-bootstrap.sql`, then apply to prod.

## Two traps

**Anonymous insert + `.select()` fails RLS.** `candidates` and
`assessment_submissions` grant INSERT to `anon` but SELECT only to
`authenticated`. `insert().select().single()` therefore fails with *"new row
violates row-level security policy"* — the insert is fine, reading the row back
is not. Public routes (`/api/apply`, `/api/assessment` POST) use
`createServiceClient()` for this reason. **Do not fix it by adding an anon
SELECT policy** — that would expose every candidate record.

**RLS off is a public leak.** `google_tokens` (Google OAuth refresh tokens) and
`interviews` shipped with RLS disabled. Because the anon key is embedded in the
client bundle of any deployed build, both tables were world-readable. RLS is
now enabled on them with no policies at all, which is correct here: every
application path to those tables goes through the service-role client, which
bypasses RLS. **Any table created by hand needs the same check** — enabling RLS
is not automatic.

## Auth configuration

Supabase Auth has its own **Site URL** and redirect allowlist, independent of
anything in this repo. They control where magic links and password resets land.
Site URL is `https://jisha.ai-rocket-experiments.com`; the allowlist also
permits `http://localhost:3000/**` for local development. If a login email ever
points at the wrong host, that setting is why — not the code.
