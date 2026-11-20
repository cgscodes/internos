export const resumeText = `Alex Example\nSoftware engineering student graduating May 2027. Built TypeScript web applications and PostgreSQL databases. Developed accessible React interfaces with automated tests. Seeking a summer internship and collaborative software engineering work. Available June through August 2027.`;
export const jobDescription = `Join our engineering team as a software engineering intern. Build accessible React interfaces with TypeScript and PostgreSQL. Collaborate with engineers on web applications, write automated tests, and review code. We require TypeScript experience and value clear written communication. This internship is available June through August 2027.`;
export function modelFindings() {
  return {
    information_sufficient: true,
    information_needed: [],
    skills_score: 80,
    experience_score: 70,
    context_score: 90,
    relevant_skills: [
      {
        finding: "TypeScript experience is documented.",
        job_evidence: "TypeScript",
        resume_evidence: "Built TypeScript web applications",
      },
    ],
    relevant_experience: [
      {
        finding: "React interface work is documented.",
        job_evidence: "Build accessible React interfaces",
        resume_evidence: "Developed accessible React interfaces",
      },
    ],
    missing_qualifications: [],
    eligibility_checks: [
      "Degree level",
      "Graduation date",
      "Work authorization",
      "Technical skills",
      "Location",
      "Availability",
    ].map((category) => ({
      category,
      requirement:
        category === "Technical skills" ? "TypeScript experience" : null,
      job_evidence:
        category === "Technical skills" ? "TypeScript experience" : null,
      resume_evidence:
        category === "Technical skills"
          ? "Built TypeScript web applications"
          : null,
      status: category === "Technical skills" ? "Met" : "Unknown",
      explanation:
        category === "Technical skills"
          ? "The resume documents TypeScript work."
          : "No explicit requirement/evidence to establish eligibility.",
    })),
    eligibility_concerns: [
      "Confirm work authorization requirements with the employer.",
    ],
    score_explanation:
      "Documented TypeScript and React work align with the role; project scope needs confirmation.",
    suggested_resume_emphasis: [
      {
        finding: "Highlight the existing React interface work.",
        job_evidence: "Build accessible React interfaces",
        resume_evidence: "Developed accessible React interfaces",
      },
    ],
    recommended_next_action:
      "Review the responsibilities and confirm the missing eligibility details before applying.",
  };
}
