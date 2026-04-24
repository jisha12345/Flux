-- Run this in your Supabase SQL editor

create extension if not exists "uuid-ossp";

create table candidates (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  email text not null,
  phone text,
  current_role text,
  current_company text,
  current_ctc text,
  expected_ctc text,
  notice_period text,
  current_location text,
  preferred_location text,
  wfh_preference text check (wfh_preference in ('remote', 'hybrid', 'office')),
  total_experience text,
  ai_comfort_score text,
  ai_tools_used text,
  ai_project_built text,
  ai_future_vision text,
  ai_without_tools_feeling text,
  biggest_build text,
  why_us text,
  portfolio_url text,
  linkedin_url text,
  github_url text,
  resume_url text,
  score integer default 0,
  score_breakdown jsonb,
  status text default 'new' check (status in ('new', 'shortlisted', 'interview', 'offer', 'rejected')),
  created_at timestamptz default now()
);

create table job_descriptions (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  department text,
  location text,
  type text,
  experience_range text,
  ctc_range text,
  about_role text,
  responsibilities jsonb default '[]',
  requirements jsonb default '[]',
  nice_to_have jsonb default '[]',
  ai_expectations text,
  is_active boolean default true,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Indexes for fast search
create index candidates_score_idx on candidates(score desc);
create index candidates_status_idx on candidates(status);
create index candidates_wfh_idx on candidates(wfh_preference);
create index candidates_created_idx on candidates(created_at desc);
create index candidates_search_idx on candidates using gin(
  to_tsvector('english',
    coalesce(full_name, '') || ' ' ||
    coalesce(current_role, '') || ' ' ||
    coalesce(current_company, '') || ' ' ||
    coalesce(ai_tools_used, '') || ' ' ||
    coalesce(ai_project_built, '')
  )
);

-- RLS: only authenticated recruiters can read candidates
alter table candidates enable row level security;
alter table job_descriptions enable row level security;

create policy "Recruiters can read candidates"
  on candidates for select
  to authenticated
  using (true);

create policy "Anyone can insert candidate"
  on candidates for insert
  to anon, authenticated
  with check (true);

create policy "Recruiters can update status"
  on candidates for update
  to authenticated
  using (true);

create policy "Recruiters manage JDs"
  on job_descriptions for all
  to authenticated
  using (true);
