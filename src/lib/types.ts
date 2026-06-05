export type JobStatus = "Applied" | "Shortlisted" | "Interview" | "Offer" | "Rejected";

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  requirements: string[];
  skills: string[];
  salary_range?: string;
  created_at: string;
  updated_at: string;
  employer_id: string;
  is_active: boolean;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
  resume_url?: string;
  skills: string[];
  experience_years?: number;
  current_role?: string;
  current_company?: string;
  answers: Record<string, string>;
  ai_score?: number;
  ai_summary?: string;
  ai_dimensions?: Record<string, number>;
  status: JobStatus;
  job_id: string;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  candidate_id: string;
  job_id: string;
  status: JobStatus;
  ai_score?: number;
  ai_summary?: string;
  created_at: string;
}

export interface Employer {
  id: string;
  email: string;
  company_name: string;
  created_at: string;
}

export interface Assessment {
  id: string;
  job_id: string;
  title: string;
  questions: AssessmentQuestion[];
  created_at: string;
}

export interface AssessmentQuestion {
  id: string;
  text: string;
  type: "text" | "code" | "multiple_choice";
  options?: string[];
  correct_answer?: string;
}

export interface AssessmentSubmission {
  id: string;
  assessment_id: string;
  candidate_id: string;
  answers: Record<string, string>;
  ai_score?: number;
  ai_feedback?: string;
  created_at: string;
}
