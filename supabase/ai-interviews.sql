-- ============================================================
-- AI Web Interviews — run in Supabase SQL Editor
-- ============================================================

create extension if not exists "uuid-ossp";

create table if not exists ai_interviews (
  id uuid primary key default uuid_generate_v4(),
  token text unique not null,

  candidate_id uuid references candidates(id),
  jd_id uuid references job_descriptions(id),

  candidate_name text not null,
  candidate_email text,
  role_title text not null,
  company_name text not null default 'Shiprocket',
  language text not null default 'en-IN',
  duration_minutes int not null default 30,

  -- Context snapshots (so the interview is reproducible even if JD/CV change)
  jd_text text,
  cv_text text,
  blueprint jsonb,

  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'evaluated', 'expired', 'error')),

  identity_photo_path text,
  video_path text,
  started_at timestamptz,
  ended_at timestamptz,

  report jsonb,
  report_generated_at timestamptz,

  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists ai_interview_turns (
  id uuid primary key default uuid_generate_v4(),
  interview_id uuid not null references ai_interviews(id) on delete cascade,
  seq int not null,
  role text not null check (role in ('interviewer', 'candidate', 'system')),
  text text not null,
  section text,
  created_at timestamptz default now(),
  unique (interview_id, seq)
);

create index if not exists ai_interviews_token_idx on ai_interviews(token);
create index if not exists ai_interviews_status_idx on ai_interviews(status);
create index if not exists ai_interviews_created_idx on ai_interviews(created_at desc);
create index if not exists ai_interview_turns_interview_idx on ai_interview_turns(interview_id, seq);

-- RLS: recruiters (authenticated) read + create; the voice gateway writes with
-- the service-role key (bypasses RLS). Candidates never touch these tables
-- directly — all candidate access is token-gated through the gateway/API.
alter table ai_interviews enable row level security;
alter table ai_interview_turns enable row level security;

drop policy if exists "Recruiters manage ai_interviews" on ai_interviews;
create policy "Recruiters manage ai_interviews" on ai_interviews
  for all to authenticated using (true) with check (true);

drop policy if exists "Recruiters read ai_interview_turns" on ai_interview_turns;
create policy "Recruiters read ai_interview_turns" on ai_interview_turns
  for select to authenticated using (true);

-- updated_at trigger (function already exists from the main schema)
drop trigger if exists ai_interviews_updated_at on ai_interviews;
create trigger ai_interviews_updated_at before update on ai_interviews
  for each row execute function update_updated_at();

-- Private storage buckets for recordings + identity photos
insert into storage.buckets (id, name, public)
  values ('interview-recordings', 'interview-recordings', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('interview-photos', 'interview-photos', false)
  on conflict (id) do nothing;

drop policy if exists "Recruiters read interview recordings" on storage.objects;
create policy "Recruiters read interview recordings" on storage.objects
  for select to authenticated
  using (bucket_id in ('interview-recordings', 'interview-photos'));
