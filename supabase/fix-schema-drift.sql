-- ============================================================
-- Schema drift repair — brings the database in line with what the
-- application actually reads and writes.
--
-- STRICTLY ADDITIVE: adds nullable columns, creates missing tables,
-- and widens two over-narrow CHECK constraints. Nothing is dropped,
-- renamed, or retyped, so it is safe to run against live data.
--
-- Companion code fixes (candidates.name -> full_name) live in
-- src/app/api/{apply,search-candidates}/route.ts and
-- src/app/api/employer/{decoder-matches,match-summary}/route.ts.
-- ============================================================

-- ── candidates ──────────────────────────────────────────────
-- Written by /api/apply, /api/cv-screen, /api/twenty2-call and the
-- twenty2 webhook; filtered by the employer analytics routes.
alter table public.candidates add column if not exists skills text[];
alter table public.candidates add column if not exists answers jsonb;
alter table public.candidates add column if not exists ai_score numeric;
alter table public.candidates add column if not exists ai_summary text;
alter table public.candidates add column if not exists ai_dimensions jsonb;
alter table public.candidates add column if not exists voice_screen jsonb;
alter table public.candidates add column if not exists job_id uuid references public.jobs(id);

-- The app writes title-case pipeline values ("Applied", "Shortlisted")
-- from /api/apply and the twenty2 webhook, and lowercase ones from the
-- dashboard. Accept both rather than forcing a data migration.
alter table public.candidates drop constraint if exists candidates_status_check;
alter table public.candidates add constraint candidates_status_check
  check (status is null or lower(status) in
    ('new', 'applied', 'shortlisted', 'interview', 'offer', 'rejected', 'hired', 'on-hold'));

-- ── jobs ────────────────────────────────────────────────────
-- /api/jd selects "id, title, company, skills, created_at" and
-- /api/source-profiles selects "title, description, skills" — both
-- error today because these columns do not exist.
alter table public.jobs add column if not exists company text;
alter table public.jobs add column if not exists location text;
alter table public.jobs add column if not exists skills jsonb default '[]';
alter table public.jobs add column if not exists requirements jsonb default '[]';
alter table public.jobs add column if not exists salary_range text;

-- ── assessments ─────────────────────────────────────────────
-- /api/generate-screening-test writes assessment_type = 'screening',
-- which the original CHECK rejected.
alter table public.assessments drop constraint if exists assessments_assessment_type_check;
alter table public.assessments add constraint assessments_assessment_type_check
  check (assessment_type is null or assessment_type in
    ('tech', 'non-tech', 'mixed', 'screening'));

-- ── assessment_submissions ──────────────────────────────────
-- /api/assessment POSTs here; the table was never created, so every
-- candidate submission has been failing. (The legacy assessment_responses
-- table is left untouched — it holds older rows in a different shape.)
create table if not exists public.assessment_submissions (
  id uuid primary key default uuid_generate_v4(),
  assessment_id uuid references public.assessments(id),
  candidate_id uuid references public.candidates(id),
  answers jsonb,
  integrity_data jsonb default '{}',
  integrity_score integer,
  ai_score numeric,
  ai_feedback text,
  created_at timestamptz default now()
);

alter table public.assessment_submissions enable row level security;

drop policy if exists "Anyone can submit assessment" on public.assessment_submissions;
create policy "Anyone can submit assessment" on public.assessment_submissions
  for insert to anon, authenticated with check (true);

drop policy if exists "Recruiters read submissions" on public.assessment_submissions;
create policy "Recruiters read submissions" on public.assessment_submissions
  for select to authenticated using (true);

-- ── twenty2_calls ───────────────────────────────────────────
-- The twenty2 webhook logs every call here. The insert is
-- fire-and-forget with errors swallowed, so this has been silently
-- discarding call logs.
create table if not exists public.twenty2_calls (
  id uuid primary key default uuid_generate_v4(),
  call_id text,
  callee_phone text,
  caller_phone text,
  duration_seconds integer,
  transcript_text text,
  ai_summary jsonb,
  output_variables jsonb,
  created_at timestamptz default now()
);

alter table public.twenty2_calls enable row level security;

drop policy if exists "Recruiters read call logs" on public.twenty2_calls;
create policy "Recruiters read call logs" on public.twenty2_calls
  for select to authenticated using (true);

-- ── Security: these two tables had RLS disabled, which exposed
-- Google OAuth refresh tokens and interview records to the public
-- anon key embedded in the deployed bundle. All application access
-- is via the service-role client, which bypasses RLS.
alter table public.google_tokens enable row level security;
alter table public.interviews enable row level security;

-- ── Indexes for the columns the app filters on ──────────────
create index if not exists candidates_job_id_idx on public.candidates(job_id);
create index if not exists candidates_ai_score_idx on public.candidates(ai_score desc);
create index if not exists assessment_submissions_assessment_idx
  on public.assessment_submissions(assessment_id);
