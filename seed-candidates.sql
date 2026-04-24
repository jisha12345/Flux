-- Run this in Supabase SQL Editor AFTER running supabase-schema.sql
-- Seeds 10 realistic sample candidates so the recruiter dashboard is populated

INSERT INTO candidates (
  full_name, email, phone,
  current_role, current_company, total_experience,
  current_ctc, expected_ctc, notice_period,
  current_location, preferred_location, wfh_preference,
  ai_comfort_score, ai_tools_used, ai_project_built,
  ai_future_vision, ai_without_tools_feeling,
  biggest_build, why_us,
  linkedin_url, github_url,
  score, score_breakdown, status
) VALUES

(
  'Arjun Mehta', 'arjun.mehta@gmail.com', '9876543210',
  'Senior Product Manager', 'Razorpay', '6',
  '28 LPA', '40 LPA', '2 months',
  'Bengaluru', 'Bengaluru / Remote', 'hybrid',
  '9', 'Claude for PRDs and research synthesis, Cursor for light scripting, Notion AI for docs, custom GPT for competitor analysis',
  'Built an internal AI triage tool that auto-classified 10k+ monthly support tickets with 89% accuracy, reducing L1 response time by 60%.',
  'I would redesign the entire discovery process — use AI to synthesise user interviews, auto-generate hypothesis trees, and run synthetic user testing before a single sprint starts.',
  'Honestly devastated. My entire workflow is built around AI. I would be 40% slower minimum.',
  'Led the payments infrastructure migration at Razorpay — moved 3 legacy systems into one unified API layer serving 2M+ merchants, zero downtime.',
  'Shiprocket is at an inflection point where AI can compress logistics complexity dramatically. I want to be in the room where that gets decided.',
  'https://linkedin.com/in/arjunmehta', 'https://github.com/arjunm',
  88,
  '{"ai_depth": 23, "communication": 22, "experience_relevance": 23, "ambition": 20, "total": 88, "summary": "Exceptional AI integration depth with real shipped impact. Strong PM instincts and clear vision for AI-first product development."}',
  'shortlisted'
),

(
  'Priya Sharma', 'priya.sharma@outlook.com', '9845678901',
  'Data Scientist', 'Flipkart', '4',
  '22 LPA', '32 LPA', '1 month',
  'Bengaluru', 'Bengaluru', 'hybrid',
  '8', 'Claude API for data pipelines, Jupyter + Copilot for analysis, LangChain for RAG pipelines, Weights & Biases',
  'Built a real-time demand forecasting system using LLM-assisted feature engineering. Improved forecast accuracy by 18% over baseline, directly saving ₹4Cr in excess inventory.',
  'AI changes everything about how I work with data — from auto-EDA to automated insight generation. I would ship 3x faster and spend zero time on boilerplate.',
  'Uncomfortable, but I would adapt. I grew up writing everything from scratch. But I would definitely miss it.',
  'End-to-end ML platform for Flipkart's fashion vertical — feature store, model registry, auto-retraining pipelines. Took it from PoC to production serving 8M SKUs.',
  'The scale of logistics data at Shiprocket is exactly the kind of problem I want to work on. Real-world messy data, real impact.',
  'https://linkedin.com/in/priyasharma-ds', 'https://github.com/priya-ml',
  82,
  '{"ai_depth": 21, "communication": 20, "experience_relevance": 22, "ambition": 19, "total": 82, "summary": "Strong ML engineering background with proven impact. Good AI tool integration and clear thinking on application to logistics."}',
  'new'
),

(
  'Rohan Kapoor', 'rohan.kapoor@gmail.com', '9901234567',
  'Engineering Manager', 'Swiggy', '8',
  '45 LPA', '60 LPA', '3 months',
  'Bengaluru', 'Bengaluru / Hybrid', 'hybrid',
  '7', 'GitHub Copilot, Claude for design docs and code reviews, Linear AI for sprint summaries',
  'Shipped an AI-assisted code review bot integrated into our CI pipeline — flags anti-patterns, security issues, and performance bottlenecks before human review.',
  'I would use AI to compress the entire engineering feedback loop — AI-generated design docs, automated test generation, AI code reviews. Human time reserved for architecture and culture.',
  'Frustrated, but I remember the before-times. Would slow down but not stop.',
  'Built and scaled Swiggy's real-time order assignment engine from 10k to 2M orders/day. Team of 18 engineers across 3 squads.',
  'Want to work on infrastructure problems that actually matter. Shiprocket's scale is the kind of challenge I have not seen at my current company.',
  'https://linkedin.com/in/rohankapoor-eng', '',
  75,
  '{"ai_depth": 18, "communication": 19, "experience_relevance": 21, "ambition": 17, "total": 75, "summary": "Solid engineering leader with real scale experience. AI integration is practical and thoughtful. Could be a strong hire for engineering leadership roles."}',
  'new'
),

(
  'Sneha Reddy', 'sneha.reddy@gmail.com', '9988776655',
  'Growth Manager', 'Meesho', '3',
  '16 LPA', '24 LPA', 'Immediate',
  'Hyderabad', 'Remote / Bengaluru', 'remote',
  '9', 'Claude for campaign copy and A/B test analysis, Perplexity for research, Make.com + AI for automation workflows, Canva AI',
  'Built a fully automated WhatsApp campaign system for Meesho resellers using AI-generated personalised messages. 3x improvement in click-through vs generic blasts.',
  'I would run 10x more experiments. AI lets me move from hypothesis to launched test in hours instead of days. The bottleneck shifts from execution to thinking.',
  'Like losing a superpower. I have fully rebuilt my workflow around AI. Nothing would be the same.',
  'Zero to 400k active resellers campaign — designed, launched, and iterated a referral program that became the company's top acquisition channel for 2 quarters.',
  'Growth at a company where operations and tech intersect is rare. Shiprocket has that. I want to bring an AI-native growth playbook to logistics.',
  'https://linkedin.com/in/snehareddy-growth', '',
  79,
  '{"ai_depth": 22, "communication": 20, "experience_relevance": 18, "ambition": 19, "total": 79, "summary": "High AI fluency with creative applications to growth. Impressive self-starter energy. Relevant experience for seller growth roles."}',
  'interview'
),

(
  'Kabir Singh', 'kabir.singh@protonmail.com', '9123456789',
  'Backend Engineer', 'PhonePe', '5',
  '30 LPA', '42 LPA', '2 months',
  'Pune', 'Bengaluru / Remote', 'hybrid',
  '6', 'GitHub Copilot daily, Claude occasionally for documentation, ChatGPT for debugging',
  'Used AI pair programming to refactor a 15-year-old payment processing module. Reduced code complexity by 40%, improved test coverage from 30% to 85%.',
  'Faster delivery, better test coverage, cleaner docs. I see AI as a force multiplier for individual contributors who want to move at startup speed.',
  'Slower, but manageable. I learned coding without AI and can go back if needed.',
  'Designed PhonePe's transaction reconciliation system handling ₹50Cr daily with 99.99% accuracy.',
  'Want to work on systems that ship physical goods. Software moving money is interesting but software moving boxes at scale feels more tangible.',
  'https://linkedin.com/in/kabirsingh-be', 'https://github.com/kabirs',
  62,
  '{"ai_depth": 14, "communication": 16, "experience_relevance": 17, "ambition": 15, "total": 62, "summary": "Solid backend engineering background. AI usage is functional but not deeply integrated. Good potential for logistics engineering roles."}',
  'new'
),

(
  'Ananya Iyer', 'ananya.iyer@gmail.com', '9765432109',
  'UX Designer', 'Cred', '4',
  '20 LPA', '28 LPA', '1 month',
  'Mumbai', 'Remote', 'remote',
  '8', 'Figma AI, Midjourney for concept exploration, Claude for UX writing and user research synthesis, Maze AI for usability testing',
  'Redesigned Cred's rewards discovery flow using AI-synthesised user research (200+ interview transcripts). 35% increase in rewards redemption rate post-launch.',
  'AI removes all the grunt work from UX research. I can synthesise 50 user interviews in an hour instead of a week. That means more time designing, less time transcribing.',
  'Very uncomfortable. AI has fundamentally changed how fast I can validate ideas.',
  'Full design system for Cred from scratch — 400+ components, motion guidelines, accessibility standards. Now used by 30+ designers.',
  'Fintech UX is solved. Logistics UX is still a disaster. Shiprocket is where design can have 10x more impact.',
  'https://linkedin.com/in/ananyaiyer-ux', '',
  77,
  '{"ai_depth": 20, "communication": 21, "experience_relevance": 17, "ambition": 19, "total": 77, "summary": "Impressive AI fluency for a designer. Strong portfolio signal. Would bring genuine AI-native thinking to product design."}',
  'shortlisted'
),

(
  'Vikram Nair', 'vikram.nair@yahoo.com', '9654321098',
  'Business Analyst', 'Infosys', '2',
  '8 LPA', '14 LPA', '15 days',
  'Chennai', 'Bengaluru / Chennai', 'hybrid',
  '4', 'ChatGPT for report writing, Excel Copilot',
  'Used ChatGPT to automate weekly status reports. Saved about 2 hours per week.',
  'I would use AI to make my analysis faster and my presentations better.',
  'A bit slower but would manage.',
  'Built a dashboard tracking SLA compliance for 200+ projects using Power BI.',
  'Looking for a growth opportunity. Shiprocket is a well-known company.',
  'https://linkedin.com/in/vikramnair', '',
  31,
  '{"ai_depth": 6, "communication": 8, "experience_relevance": 9, "ambition": 8, "total": 31, "summary": "Limited AI integration and surface-level answers. Generic motivation. Would not be a strong fit for an AI-first environment."}',
  'rejected'
),

(
  'Divya Menon', 'divya.menon@gmail.com', '9543210987',
  'Product Analyst', 'Amazon', '3',
  '18 LPA', '26 LPA', '1 month',
  'Bengaluru', 'Bengaluru', 'hybrid',
  '7', 'Claude for SQL query generation and documentation, dbt + AI for data modelling, Hex AI for notebook insights',
  'Built an AI-assisted funnel analysis tool that auto-generates insight summaries from raw event data. Used by 12 PMs at Amazon India.',
  'I would automate the entire reporting layer and spend 100% of my time on forward-looking analysis instead of backward-looking reporting.',
  'I would be frustrated but functional. The deeper issue is speed — AI makes me 2x faster at the analytical parts.',
  'Redesigned Amazon India's seller onboarding metrics framework — new definitions, new dashboards, adopted org-wide.',
  'Want to move from a company where I own 0.001% of outcomes to one where my work is directly visible.',
  'https://linkedin.com/in/divyamenon-data', 'https://github.com/divyam',
  71,
  '{"ai_depth": 17, "communication": 18, "experience_relevance": 19, "ambition": 17, "total": 71, "summary": "Strong analytical background with thoughtful AI integration. Good self-awareness about impact vs speed tradeoff. Solid candidate for analytics roles."}',
  'new'
),

(
  'Aditya Bose', 'aditya.bose@gmail.com', '9432109876',
  'Founding Engineer', 'Stealth Startup', '7',
  '35 LPA', '50 LPA', 'Immediate',
  'Bengaluru', 'Anywhere', 'remote',
  '10', 'Claude API (deeply — custom agents, RAG pipelines, multi-step workflows), Cursor, v0 for UI, LangGraph for orchestration, custom fine-tuned models',
  'Built an AI-native B2B SaaS from scratch — automated contract review using Claude. 40 paying customers, $12k MRR before I wound it down to take a break.',
  'I would rebuild every internal workflow. AI agents for data pipelines, automated anomaly detection, self-healing infrastructure. The boring stuff should run itself.',
  'That would be like asking a surgeon to operate with chopsticks.',
  'Shipped a full-stack AI contract platform solo — Claude integration, RAG over legal docs, Stripe billing, SOC2 prep — in 6 months.',
  'I want to build at scale again. Shiprocket has the data, the infrastructure complexity, and the GTM moat. I want to be patient zero for AI adoption here.',
  'https://linkedin.com/in/adityabose-eng', 'https://github.com/adityab',
  96,
  '{"ai_depth": 25, "communication": 24, "experience_relevance": 24, "ambition": 23, "total": 96, "summary": "Exceptional candidate — rare combination of deep AI engineering skills and product thinking. Has shipped real AI products. Top priority to move fast on."}',
  'offer'
),

(
  'Pooja Agarwal', 'pooja.agarwal@gmail.com', '9321098765',
  'Content & Brand Manager', 'Nykaa', '5',
  '15 LPA', '22 LPA', '2 months',
  'Delhi', 'Remote / Delhi', 'remote',
  '8', 'Claude for long-form content strategy and scripting, ElevenLabs for audio, Heygen for video, Perplexity for research',
  'Built Nykaa''s AI content calendar system — Claude generates brief variations, human editors pick and refine. Cut content production cost by 45% while increasing output 3x.',
  'I would build an AI content engine that produces 10x the content at 20% of the cost, with a human layer for brand voice and final approval.',
  'Sad but okay. I started in content before AI and I know how to write. But the leverage would be gone.',
  'Launched Nykaa''s YouTube channel from 0 to 800k subscribers in 18 months — strategy, production, and creator partnerships.',
  'Logistics brands have terrible content. Nobody is doing AI-native brand building in this space. I want to be the first.',
  'https://linkedin.com/in/poojaagarwal-brand', '',
  73,
  '{"ai_depth": 20, "communication": 19, "experience_relevance": 16, "ambition": 18, "total": 73, "summary": "Creative with genuine AI tooling depth for a non-technical role. Strong content track record. Good fit for marketing or brand roles."}',
  'new'
);
