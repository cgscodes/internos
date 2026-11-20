import { z } from "zod";

export const MATCH_MODEL = "gemini-3.8-flash";
export const MATCH_VERSION = "resume-match-v1";
export const matchRequestSchema = z
  .object({
    job_id: z.uuid(),
    resume_id: z.uuid(),
    refresh: z.boolean().default(false),
  })
  .strict();
const text = z.string().min(1).max(1200);
const evidence = z
  .object({
    finding: text,
    job_evidence: text,
    resume_evidence: text,
  })
  .strict();
export const eligibilityCategories = [
  "Degree level",
  "Graduation date",
  "Work authorization",
  "Technical skills",
  "Location",
  "Availability",
] as const;
export const modelAnalysisSchema = z
  .object({
    information_sufficient: z.boolean(),
    information_needed: z.array(text).max(8),
    skills_score: z.int().min(0).max(100),
    experience_score: z.int().min(0).max(100),
    context_score: z.int().min(0).max(100),
    relevant_skills: z.array(evidence).max(12),
    relevant_experience: z.array(evidence).max(12),
    missing_qualifications: z
      .array(z.object({ requirement: text, job_evidence: text }).strict())
      .max(12),
    eligibility_checks: z
      .array(
        z
          .object({
            category: z.enum(eligibilityCategories),
            requirement: text.nullable(),
            job_evidence: text.nullable(),
            resume_evidence: text.nullable(),
            status: z.enum(["Met", "Not met", "Unknown"]),
            explanation: text,
          })
          .strict(),
      )
      .length(6),
    eligibility_concerns: z.array(text).max(8),
    score_explanation: text,
    suggested_resume_emphasis: z.array(evidence).max(6),
    recommended_next_action: text,
  })
  .strict();
export type ModelAnalysis = z.infer<typeof modelAnalysisSchema>;
export type MatchFindings = ModelAnalysis & {
  match_score: number;
  eligibility_status:
    "Meets stated requirements" | "Potential mismatch" | "Unknown";
};
export type MatchAnalysis = {
  id: string;
  user_id: string;
  job_id: string;
  resume_id: string;
  model: string;
  prompt_version: string;
  input_hash: string;
  job_hash: string;
  resume_hash: string;
  created_at: string;
  match_score: number;
  findings: MatchFindings;
  usage: Record<string, number>;
};
export class MatchError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "invalid_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export type MatchInput = { resume: string; job: string };
export interface MatchProvider {
  readonly model: string;
  analyze(
    input: MatchInput,
    signal: AbortSignal,
  ): Promise<{ text: string; usage: Record<string, number> }>;
}
