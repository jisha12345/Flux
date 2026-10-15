-- ============================================================
-- FLUX — local dev bootstrap (local Supabase stack only)
--
-- Recreates the hosted project's schema for `supabase start`.
-- Derived from supabase-schema.sql plus every table/column the
-- application code actually touches. Run after `supabase start`:
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -f supabase/local-bootstrap.sql -f supabase/ai-interviews.sql
-- ============================================================

create extension if not exists "uuid-ossp";

drop table if exists assessment_submissions cascade;
drop table if exists assessments cascade;
drop table if exists interviews cascade;
drop table if exists google_tokens cascade;
drop table if exists twenty2_calls cascade;
drop table if exists scraped_profiles cascade;
drop table if exists candidates cascade;
drop table if exists job_descriptions cascade;
drop table if exists jobs cascade;

create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- ============================================================
-- JOBS (JD builder / iimjobs imports; also fallback JD source)
-- ============================================================
create table jobs (
  id uuid primary key default uuid_generate_v4(),
  title text,
  company text,
  location text,
  description text,
  requirements jsonb default '[]',
  skills jsonb default '[]',
  salary_range text,
  employer_id uuid references auth.users(id),
  is_active boolean default true,
  source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- CANDIDATES
-- Local deltas vs supabase-schema.sql: no status CHECK (app code
-- writes title-case values), plus the code-only columns: name,
-- naukri_url, job_id, ai_score, ai_summary, ai_dimensions,
-- answers, skills, voice_screen.
-- ============================================================
create table candidates (
  id uuid primary key default uuid_generate_v4(),

  full_name text,
  name text,
  email text,
  phone text,
  gender text,

  "current_role" text,
  current_company text,
  company_type text,
  industry text,
  functional_area text,

  total_experience text,
  experience_years numeric,
  previous_companies text,

  current_ctc text,
  current_ctc_numeric numeric,
  expected_ctc text,
  expected_ctc_numeric numeric,
  notice_period text,
  notice_period_days integer,

  current_location text,
  preferred_location text,
  wfh_preference text check (wfh_preference in ('remote', 'hybrid', 'office')),
  willing_to_relocate boolean default false,

  highest_qualification text,
  college text,
  graduation_year text,
  tier text,

  key_skills text,
  skills text[],
  languages text,
  certifications text,
  profile_summary text,

  ai_comfort_score text,
  ai_tools_used text,
  ai_project_built text,
  ai_future_vision text,
  ai_without_tools_feeling text,

  biggest_build text,
  why_us text,

  linkedin_url text,
  github_url text,
  naukri_url text,
  portfolio_url text,
  resume_url text,

  score integer default 0,
  score_breakdown jsonb,
  ai_score numeric,
  ai_summary text,
  ai_dimensions jsonb,
  answers jsonb,
  voice_screen jsonb,

  job_id uuid references jobs(id),

  status text default 'new',
  recruiter_notes text,
  source text default 'form',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- JOB DESCRIPTIONS
-- ============================================================
create table job_descriptions (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  department text,
  functional_area text,
  industry text,
  location text,
  type text check (type in ('full-time', 'part-time', 'contract', 'internship')),
  experience_range text,
  experience_min numeric,
  experience_max numeric,
  ctc_range text,
  ctc_min numeric,
  ctc_max numeric,
  about_role text,
  responsibilities jsonb default '[]',
  requirements jsonb default '[]',
  nice_to_have jsonb default '[]',
  key_skills jsonb default '[]',
  ai_expectations text,
  is_active boolean default true,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- ============================================================
-- SCRAPED PROFILES
-- ============================================================
create table scraped_profiles (
  id uuid primary key default uuid_generate_v4(),
  source text not null,
  source_url text,
  raw_data jsonb,
  candidate_id uuid references candidates(id),
  status text default 'pending' check (status in ('pending', 'imported', 'skipped')),
  created_at timestamptz default now()
);

-- ============================================================
-- INTERVIEWS (calendar-scheduled human interviews)
-- ============================================================
create table interviews (
  id uuid primary key default uuid_generate_v4(),
  candidate_id uuid references candidates(id),
  candidate_name text,
  round integer default 1,
  interviewer_name text,
  interviewer_email text,
  scheduled_at timestamptz,
  duration_minutes integer default 60,
  meet_link text,
  calendar_event_id text,
  status text default 'scheduled',
  transcript text,
  ai_analysis jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- ============================================================
-- ASSESSMENTS + SUBMISSIONS
-- ============================================================
create table assessments (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid references jobs(id),
  title text,
  questions jsonb default '[]',
  time_limit_minutes integer default 10,
  assessment_type text,
  jd_brief text,
  created_at timestamptz default now()
);

create table assessment_submissions (
  id uuid primary key default uuid_generate_v4(),
  assessment_id uuid references assessments(id),
  candidate_id uuid references candidates(id),
  answers jsonb,
  integrity_data jsonb default '{}',
  integrity_score integer,
  ai_score numeric,
  ai_feedback text,
  created_at timestamptz default now()
);

-- ============================================================
-- GOOGLE TOKENS (calendar OAuth)
-- ============================================================
create table google_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid unique references auth.users(id),
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- TWENTY2 CALL LOGS (webhook fire-and-forget)
-- ============================================================
create table twenty2_calls (
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

-- ============================================================
-- INDEXES
-- ============================================================
create index candidates_score_idx on candidates(score desc);
create index candidates_status_idx on candidates(status);
create index candidates_created_idx on candidates(created_at desc);
create index candidates_search_idx on candidates using gin(
  to_tsvector('english',
    coalesce(full_name, '') || ' ' ||
    coalesce("current_role", '') || ' ' ||
    coalesce(current_company, '') || ' ' ||
    coalesce(key_skills, '') || ' ' ||
    coalesce(functional_area, '') || ' ' ||
    coalesce(industry, '') || ' ' ||
    coalesce(previous_companies, '')
  )
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table candidates enable row level security;
alter table job_descriptions enable row level security;
alter table scraped_profiles enable row level security;
alter table jobs enable row level security;
alter table interviews enable row level security;
alter table assessments enable row level security;
alter table assessment_submissions enable row level security;
alter table google_tokens enable row level security;
alter table twenty2_calls enable row level security;

create policy "Anyone can insert candidate" on candidates for insert to anon, authenticated with check (true);
create policy "Recruiters can read candidates" on candidates for select to authenticated using (true);
create policy "Recruiters can update candidates" on candidates for update to authenticated using (true);
create policy "Recruiters manage JDs" on job_descriptions for all to authenticated using (true);
create policy "Recruiters manage scraped profiles" on scraped_profiles for all to authenticated using (true);
create policy "Recruiters manage jobs" on jobs for all to authenticated using (true);
create policy "Anyone can read active jobs" on jobs for select to anon using (is_active);
create policy "Recruiters manage interviews" on interviews for all to authenticated using (true);
create policy "Recruiters manage assessments" on assessments for all to authenticated using (true);
create policy "Anyone can read assessments" on assessments for select to anon using (true);
create policy "Anyone can submit assessment" on assessment_submissions for insert to anon, authenticated with check (true);
create policy "Recruiters read submissions" on assessment_submissions for select to authenticated using (true);
create policy "Own google tokens" on google_tokens for all to authenticated using (user_id = auth.uid());
create policy "Recruiters read call logs" on twenty2_calls for select to authenticated using (true);

create trigger candidates_updated_at before update on candidates
  for each row execute function update_updated_at();

-- ============================================================
-- SEED — one recruiter-visible JD + job + two candidates
-- ============================================================
insert into job_descriptions (id, title, department, functional_area, location, type,
  experience_range, ctc_range, about_role, responsibilities, requirements, key_skills, ai_expectations)
values (
  'a1b2c3d4-0000-4000-8000-000000000001',
  'Senior Backend Engineer',
  'Technology', 'Engineering', 'Gurugram (Hybrid)', 'full-time',
  '5-8 years', '35-50 LPA',
  'Own the order-management and logistics-routing services that move millions of shipments a day. You will design for scale, mentor a pod of four engineers, and drive reliability of high-throughput APIs consumed by thousands of sellers.',
  '["Design and evolve high-throughput Node.js/TypeScript microservices","Own SLOs for the order pipeline (99.95% availability target)","Lead architecture reviews and mentor a 4-engineer pod","Partner with product on courier-allocation and NDR-reduction features"]',
  '["5+ years building backend systems at scale","Deep PostgreSQL and queueing (Kafka/SQS) experience","Production ownership: on-call, observability, incident reviews","Strong system-design and API-design fundamentals"]',
  '["Node.js","TypeScript","PostgreSQL","Kafka","AWS","System Design"]',
  'Comfort using AI coding tools daily; expected to review AI-generated code critically.'
);

insert into jobs (id, title, company, location, description, skills, is_active)
values (
  'b2c3d4e5-0000-4000-8000-000000000002',
  'Senior Backend Engineer', 'Shiprocket', 'Gurugram',
  'Backend engineer for order-management systems at logistics scale.',
  '["Node.js","PostgreSQL","Kafka"]', true
);

insert into candidates (id, full_name, name, email, phone, "current_role", current_company,
  total_experience, experience_years, previous_companies, current_ctc, expected_ctc,
  notice_period, current_location, highest_qualification, college, key_skills, profile_summary, status)
values
(
  'c3d4e5f6-0000-4000-8000-000000000003',
  'Rohan Mehta', 'Rohan Mehta', 'rohan.mehta@example.com', '+91 98100 11223',
  'Staff Engineer', 'Delhivery',
  '7 years', 7, 'Delhivery, Paytm, Zomato',
  '38 LPA', '48 LPA', '30 days', 'Gurugram',
  'B.Tech (CSE)', 'NIT Trichy',
  'Node.js, TypeScript, PostgreSQL, Kafka, Redis, AWS, Kubernetes, System Design',
  'Backend engineer with 7 years across logistics and consumer platforms. At Delhivery, led the shipment-tracking platform (400M events/day) through a Kafka re-architecture that cut p99 latency from 900ms to 120ms. Previously built Paytm''s settlement reconciliation service and Zomato''s order-state machine. Mentors two junior engineers; runs the backend guild''s design-review forum.',
  'shortlisted'
),
(
  'd4e5f6a7-0000-4000-8000-000000000004',
  'Sneha Iyer', 'Sneha Iyer', 'sneha.iyer@example.com', '+91 98200 44556',
  'Senior Software Engineer', 'Razorpay',
  '5 years', 5, 'Razorpay, Freshworks',
  '30 LPA', '40 LPA', '60 days', 'Bengaluru',
  'B.E. (IT)', 'BITS Pilani',
  'Go, Node.js, PostgreSQL, gRPC, Docker, AWS',
  'Payments-infrastructure engineer with 5 years of experience. Owns Razorpay''s webhook delivery platform (150M callbacks/month, 99.99% delivery SLA) and led its migration from cron-based retries to an event-driven scheduler. At Freshworks, built multi-tenant rate limiting used across three product lines.',
  'new'
);
