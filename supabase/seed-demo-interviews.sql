-- ============================================================
-- Demo seed: sample JDs + candidates + ready-to-open AI interviews.
-- Local testing only. Idempotent — safe to re-run.
--
-- The dashboard's JD dropdown lists the `jobs` table while the API
-- enriches from `job_descriptions` by the same id, so each JD is
-- inserted into BOTH tables with an identical uuid.
-- ============================================================

delete from ai_interview_turns where interview_id in (
  select id from ai_interviews where token like 'demo-%' and token <> 'demo-sneha-e2e');
delete from ai_interviews where token like 'demo-%' and token <> 'demo-sneha-e2e';
delete from candidates where id in (
  '11111111-0000-4000-8000-000000000001',
  '11111111-0000-4000-8000-000000000002',
  '11111111-0000-4000-8000-000000000003');
delete from job_descriptions where id in (
  '22222222-0000-4000-8000-000000000001',
  '22222222-0000-4000-8000-000000000002',
  '22222222-0000-4000-8000-000000000003');
delete from jobs where id in (
  '22222222-0000-4000-8000-000000000001',
  '22222222-0000-4000-8000-000000000002',
  '22222222-0000-4000-8000-000000000003');

-- ── JDs ─────────────────────────────────────────────────────

insert into job_descriptions (id, title, department, functional_area, location, type,
  experience_range, ctc_range, about_role, responsibilities, requirements, key_skills, ai_expectations)
values
(
  '22222222-0000-4000-8000-000000000001',
  'Product Manager — Growth', 'Product', 'Product Management', 'Gurugram (Hybrid)', 'full-time',
  '4-7 years', '30-45 LPA',
  'Own seller-activation and retention funnels for a logistics platform serving 100k+ D2C sellers. You will run experiments across onboarding, pricing nudges, and engagement loops, working with two engineering pods and a data analyst.',
  '["Own the seller activation funnel end to end (signup → first shipment → habit)","Design and run A/B experiments; maintain the growth model","Write crisp PRDs and drive two engineering pods","Partner with data to define and instrument north-star metrics"]',
  '["4+ years product management in consumer or SMB-facing products","Demonstrated experiment velocity with measurable funnel wins","Strong SQL / analytics fluency; comfort defining metrics from scratch","Excellent written communication"]',
  '["Growth loops","A/B experimentation","Funnel analytics","SQL","PRD writing","Stakeholder management"]',
  'Uses AI tools for analysis and drafting; expected to critically evaluate AI-generated insights.'
),
(
  '22222222-0000-4000-8000-000000000002',
  'Frontend Engineer — React', 'Technology', 'Engineering', 'Bengaluru (Hybrid)', 'full-time',
  '3-5 years', '20-32 LPA',
  'Build the seller-facing dashboard used daily by 100k+ merchants — shipment tracking, rate calculators, bulk order flows. Performance and polish matter: the dashboard is the product for our sellers.',
  '["Ship features across the seller dashboard (React 18, Next.js, TypeScript)","Own Core Web Vitals budgets and bundle discipline","Build reusable components with the design system team","Write meaningful tests and participate in code review"]',
  '["3+ years production React/TypeScript experience","Deep understanding of rendering performance and state management","Experience with Next.js or similar SSR frameworks","Track record of shipping accessible, polished UI"]',
  '["React","TypeScript","Next.js","Performance optimization","Design systems","Testing"]',
  'Comfortable pair-programming with AI assistants; reviews generated code rigorously.'
),
(
  '22222222-0000-4000-8000-000000000003',
  'VP of Engineering', 'Technology', 'Engineering Leadership', 'Gurugram', 'full-time',
  '12-18 years', '90-140 LPA',
  'Lead a 60-engineer organization across order management, courier integrations, and platform infrastructure. The org needs an executive who can set technical direction, rebuild delivery predictability, and grow engineering managers — while staying credible in architecture reviews.',
  '["Own engineering strategy, architecture direction, and delivery predictability for a 60-engineer org","Hire, grow, and calibrate engineering managers and staff+ engineers","Drive reliability program: SLOs, incident discipline, capacity planning","Partner with product and business leadership on roadmap and headcount"]',
  '["12+ years in engineering with 5+ leading multi-team orgs (30+ engineers)","Has scaled platforms through hypergrowth; credible in deep technical review","Proven track record rebuilding underperforming teams","Experience with marketplace, logistics, or fintech scale preferred"]',
  '["Engineering leadership","Org design","Architecture strategy","Reliability engineering","Hiring & calibration","Executive communication"]',
  'Expected to set the org''s AI-tooling strategy and governance.'
);

insert into jobs (id, title, company, location, description, skills, is_active)
values
('22222222-0000-4000-8000-000000000001', 'Product Manager — Growth', 'Shiprocket', 'Gurugram',
 'Own seller-activation and retention funnels; run growth experiments across onboarding and engagement.',
 '["Growth","Experimentation","SQL"]', true),
('22222222-0000-4000-8000-000000000002', 'Frontend Engineer — React', 'Shiprocket', 'Bengaluru',
 'Build the seller dashboard used by 100k+ merchants. React 18, Next.js, TypeScript.',
 '["React","TypeScript","Next.js"]', true),
('22222222-0000-4000-8000-000000000003', 'VP of Engineering', 'Shiprocket', 'Gurugram',
 'Lead a 60-engineer org across order management, courier integrations, and platform infra.',
 '["Leadership","Architecture","Reliability"]', true);

-- ── Candidates ──────────────────────────────────────────────

insert into candidates (id, full_name, name, email, phone, "current_role", current_company,
  total_experience, experience_years, previous_companies, current_ctc, expected_ctc,
  notice_period, current_location, highest_qualification, college, key_skills, profile_summary, status)
values
(
  '11111111-0000-4000-8000-000000000001',
  'Aditi Rao', 'Aditi Rao', 'aditi.rao@example.com', '+91 98111 22334',
  'Senior Product Manager', 'Meesho',
  '6 years', 6, 'Meesho, Cred, ZS Associates',
  '32 LPA', '42 LPA', '45 days', 'Bengaluru',
  'MBA', 'IIM Indore',
  'Growth loops, A/B testing, SQL, Mixpanel, Funnel analytics, PRDs, Pricing experiments',
  'Growth PM with 6 years across consumer commerce. At Meesho, owns the reseller activation funnel — took first-order conversion from 31% to 44% over 5 quarters through 40+ experiments (onboarding checklist redesign, vernacular nudges, COD-trust badges). At Cred, ran the rewards-redemption loop (DAU +18%). Started as an analytics consultant at ZS. Writes her own SQL; known for one-page PRDs and kill-fast experiment discipline.',
  'shortlisted'
),
(
  '11111111-0000-4000-8000-000000000002',
  'Karan Malhotra', 'Karan Malhotra', 'karan.malhotra@example.com', '+91 98222 33445',
  'SDE-2 Frontend', 'Swiggy',
  '4 years', 4, 'Swiggy, Razorpay',
  '24 LPA', '30 LPA', '30 days', 'Bengaluru',
  'B.Tech (CSE)', 'DTU Delhi',
  'React, TypeScript, Next.js, Redux Toolkit, React Query, Webpack, Vitest, Lighthouse, Storybook',
  'Frontend engineer with 4 years shipping merchant-facing surfaces. At Swiggy, rebuilt the restaurant-partner order screen (used by 200k restaurants) — cut LCP from 4.1s to 1.8s via route-level code splitting and a virtualized order list, and drove Storybook adoption for the partner design system (60+ components). At Razorpay, built the payment-links dashboard and its bulk-upload flow. Cares about accessibility; ships with axe checks in CI.',
  'new'
),
(
  '11111111-0000-4000-8000-000000000003',
  'Vikram Shetty', 'Vikram Shetty', 'vikram.shetty@example.com', '+91 98333 44556',
  'Director of Engineering', 'Flipkart',
  '15 years', 15, 'Flipkart, Ola, ThoughtWorks',
  '95 LPA', '130 LPA', '90 days', 'Bengaluru',
  'B.E. (CSE)', 'RV College of Engineering',
  'Org design, Platform architecture, Reliability programs, Hiring, Kafka, Java/Go systems, Executive communication',
  'Engineering leader with 15 years, currently Director at Flipkart running fulfilment-platform engineering — 4 EMs, 55 engineers across warehouse allocation, courier routing, and returns. Rebuilt the org after 40% attrition in 2023: rehired to 55, cut regretted attrition to 6%, and took deploy frequency from fortnightly to daily behind a progressive-delivery platform. Earlier at Ola, scaled the marketplace pricing platform through 10x ride growth as Senior EM. Started as a consultant at ThoughtWorks. Chairs architecture council; still reviews critical designs personally.',
  'shortlisted'
);

-- ── Ready-to-open interviews (blueprint generates on first connect) ──

insert into ai_interviews (token, candidate_id, jd_id, candidate_name, candidate_email,
  role_title, company_name, language, duration_minutes, jd_text, cv_text, status)
values
(
  'demo-pm-aditi',
  '11111111-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001',
  'Aditi Rao', 'aditi.rao@example.com',
  'Product Manager — Growth', 'Shiprocket', 'en-IN', 15,
  'Product Manager — Growth at Shiprocket (Gurugram, Hybrid). Own seller-activation and retention funnels for a logistics platform serving 100k+ D2C sellers. Responsibilities: own the seller activation funnel end to end (signup → first shipment → habit); design and run A/B experiments and maintain the growth model; write crisp PRDs and drive two engineering pods; partner with data on north-star metrics. Requirements: 4+ years PM in consumer/SMB products; demonstrated experiment velocity with measurable funnel wins; strong SQL and analytics fluency; excellent written communication. Key skills: growth loops, A/B experimentation, funnel analytics, SQL, PRD writing, stakeholder management.',
  'Aditi Rao — Senior Product Manager at Meesho (6 years; Meesho, Cred, ZS Associates). Owns the reseller activation funnel: first-order conversion 31% → 44% over 5 quarters via 40+ experiments (onboarding checklist redesign, vernacular nudges, COD-trust badges). Previously ran Cred''s rewards-redemption loop (DAU +18%). Ex-analytics consultant at ZS. MBA, IIM Indore. Writes her own SQL; one-page PRDs; kill-fast experiment discipline.',
  'pending'
),
(
  'demo-fe-karan',
  '11111111-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002',
  'Karan Malhotra', 'karan.malhotra@example.com',
  'Frontend Engineer — React', 'Shiprocket', 'en-IN', 15,
  'Frontend Engineer — React at Shiprocket (Bengaluru, Hybrid). Build the seller dashboard used daily by 100k+ merchants — shipment tracking, rate calculators, bulk order flows. Responsibilities: ship features across the dashboard (React 18, Next.js, TypeScript); own Core Web Vitals budgets and bundle discipline; build reusable components with the design-system team; write meaningful tests. Requirements: 3+ years production React/TypeScript; deep rendering-performance and state-management understanding; Next.js or similar SSR experience; track record of accessible, polished UI.',
  'Karan Malhotra — SDE-2 Frontend at Swiggy (4 years; Swiggy, Razorpay). Rebuilt the restaurant-partner order screen (200k restaurants): LCP 4.1s → 1.8s via route-level code splitting and a virtualized order list; drove Storybook adoption for the partner design system (60+ components). At Razorpay, built the payment-links dashboard and bulk-upload flow. B.Tech CSE, DTU. Ships with axe accessibility checks in CI. Skills: React, TypeScript, Next.js, Redux Toolkit, React Query, Vitest.',
  'pending'
),
(
  'demo-vp-vikram',
  '11111111-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000003',
  'Vikram Shetty', 'vikram.shetty@example.com',
  'VP of Engineering', 'Shiprocket', 'en-IN', 30,
  'VP of Engineering at Shiprocket (Gurugram). Lead a 60-engineer organization across order management, courier integrations, and platform infrastructure. Responsibilities: own engineering strategy, architecture direction, and delivery predictability; hire, grow, and calibrate EMs and staff+ engineers; drive the reliability program (SLOs, incident discipline, capacity planning); partner with product and business leadership on roadmap and headcount. Requirements: 12+ years engineering, 5+ leading multi-team orgs of 30+; scaled platforms through hypergrowth; credible in deep technical review; rebuilt underperforming teams; marketplace/logistics/fintech scale preferred.',
  'Vikram Shetty — Director of Engineering at Flipkart (15 years; Flipkart, Ola, ThoughtWorks). Runs fulfilment-platform engineering: 4 EMs, 55 engineers across warehouse allocation, courier routing, returns. Rebuilt the org after 40% attrition in 2023 — rehired to 55, regretted attrition down to 6%, deploy frequency fortnightly → daily via a progressive-delivery platform. Earlier Senior EM at Ola scaling marketplace pricing through 10x ride growth. B.E. CSE, RV College. Chairs the architecture council; still personally reviews critical designs.',
  'pending'
),
(
  'demo-hi-karan',
  '11111111-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002',
  'Karan Malhotra', 'karan.malhotra@example.com',
  'Frontend Engineer — React', 'Shiprocket', 'hi-IN', 10,
  'Frontend Engineer — React at Shiprocket (Bengaluru, Hybrid). Build the seller dashboard used daily by 100k+ merchants. React 18, Next.js, TypeScript; Core Web Vitals ownership; design-system collaboration; accessible, polished UI.',
  'Karan Malhotra — SDE-2 Frontend at Swiggy (4 years; Swiggy, Razorpay). Rebuilt the restaurant-partner order screen (200k restaurants): LCP 4.1s → 1.8s. Drove Storybook adoption (60+ components). Previously payment-links dashboard at Razorpay. Skills: React, TypeScript, Next.js.',
  'pending'
);
