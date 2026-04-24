export interface CandidateApplication {
  id?: string;
  full_name: string;
  email: string;
  phone: string;
  current_role: string;
  current_company: string;
  current_ctc: string;
  expected_ctc: string;
  notice_period: string;
  current_location: string;
  preferred_location: string;
  wfh_preference: "remote" | "hybrid" | "office";
  total_experience: string;
  ai_comfort_score: string;
  ai_tools_used: string;
  ai_project_built: string;
  ai_future_vision: string;
  ai_without_tools_feeling: string;
  biggest_build: string;
  why_us: string;
  portfolio_url: string;
  linkedin_url: string;
  github_url: string;
  resume_url?: string;
  score?: number;
  score_breakdown?: ScoreBreakdown;
  status?: "new" | "shortlisted" | "interview" | "offer" | "rejected";
  created_at?: string;
}

export interface ScoreBreakdown {
  ai_depth: number;
  communication: number;
  experience_relevance: number;
  ambition: number;
  total: number;
  summary: string;
}

export interface JobDescription {
  id?: string;
  title: string;
  department: string;
  location: string;
  type: "full-time" | "part-time" | "contract" | "internship";
  experience_range: string;
  ctc_range: string;
  about_role: string;
  responsibilities: string[];
  requirements: string[];
  nice_to_have: string[];
  ai_expectations: string;
  created_at?: string;
  is_active?: boolean;
}
