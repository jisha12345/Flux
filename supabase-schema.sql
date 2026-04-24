-- ============================================================
-- FLUX — Full Schema (run this fresh in Supabase SQL Editor)
-- ============================================================

create extension if not exists "uuid-ossp";

-- Drop existing tables if re-running
drop table if exists candidates cascade;
drop table if exists job_descriptions cascade;
drop table if exists scraped_profiles cascade;

-- ============================================================
-- CANDIDATES (form submissions + scraped/imported profiles)
-- ============================================================
create table candidates (
  id uuid primary key default uuid_generate_v4(),

  -- Basic info
  full_name text not null,
  email text,
  phone text,
  gender text,

  -- Role & company
  current_role text,
  current_company text,
  company_type text,          -- product / service / startup / logistics / mnc
  industry text,              -- E-commerce, Logistics, Fintech, etc.
  functional_area text,       -- Product, Technology, Marketing, etc.

  -- Experience
  total_experience text,      -- e.g. "5 years 3 months"
  experience_years numeric,   -- numeric for filtering
  previous_companies text,    -- comma separated

  -- Compensation
  current_ctc text,
  current_ctc_numeric numeric, -- in LPA for filtering
  expected_ctc text,
  expected_ctc_numeric numeric,
  notice_period text,
  notice_period_days integer,  -- for filtering (0, 15, 30, 60, 90)

  -- Location
  current_location text,
  preferred_location text,
  wfh_preference text check (wfh_preference in ('remote', 'hybrid', 'office')),
  willing_to_relocate boolean default false,

  -- Education
  highest_qualification text,  -- B.Tech, MBA, BCA, etc.
  college text,
  graduation_year text,
  tier text,                   -- Tier 1 / Tier 2 / Tier 3

  -- Skills & profile
  key_skills text,             -- comma separated
  languages text,              -- programming or spoken
  certifications text,
  profile_summary text,

  -- AI-specific (from form)
  ai_comfort_score text,
  ai_tools_used text,
  ai_project_built text,
  ai_future_vision text,
  ai_without_tools_feeling text,

  -- Form answers
  biggest_build text,
  why_us text,

  -- Links & documents
  linkedin_url text,
  github_url text,
  portfolio_url text,
  resume_url text,

  -- Scoring
  score integer default 0,
  score_breakdown jsonb,

  -- Pipeline
  status text default 'new' check (status in ('new', 'shortlisted', 'interview', 'offer', 'rejected')),
  recruiter_notes text,

  -- Source tracking
  source text default 'form',  -- form / linkedin / naukri / csv / manual

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
-- SCRAPED PROFILES (raw data from LinkedIn / Naukri via Scrapingdog)
-- ============================================================
create table scraped_profiles (
  id uuid primary key default uuid_generate_v4(),
  source text not null,         -- linkedin / naukri / manual
  source_url text,
  raw_data jsonb,               -- full API response stored here
  candidate_id uuid references candidates(id),  -- linked once imported
  status text default 'pending' check (status in ('pending', 'imported', 'skipped')),
  created_at timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index candidates_score_idx on candidates(score desc);
create index candidates_status_idx on candidates(status);
create index candidates_wfh_idx on candidates(wfh_preference);
create index candidates_ctc_idx on candidates(current_ctc_numeric);
create index candidates_exp_idx on candidates(experience_years);
create index candidates_notice_idx on candidates(notice_period_days);
create index candidates_company_type_idx on candidates(company_type);
create index candidates_functional_idx on candidates(functional_area);
create index candidates_created_idx on candidates(created_at desc);
create index candidates_search_idx on candidates using gin(
  to_tsvector('english',
    coalesce(full_name, '') || ' ' ||
    coalesce(current_role, '') || ' ' ||
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

create policy "Anyone can insert candidate" on candidates for insert to anon, authenticated with check (true);
create policy "Recruiters can read candidates" on candidates for select to authenticated using (true);
create policy "Recruiters can update candidates" on candidates for update to authenticated using (true);
create policy "Recruiters manage JDs" on job_descriptions for all to authenticated using (true);
create policy "Recruiters manage scraped profiles" on scraped_profiles for all to authenticated using (true);

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger candidates_updated_at before update on candidates
  for each row execute function update_updated_at();
