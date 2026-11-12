import type { Application, Job } from "../models";
export const submittedStatuses: Application["status"][] = [
  "Applied",
  "Assessment",
  "Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
];
export function isSubmitted(status: Application["status"]) {
  return submittedStatuses.includes(status);
}
export function dashboardSummary(apps: Application[], today: string) {
  return {
    total: apps.length,
    submitted: apps.filter((a) => isSubmitted(a.status)).length,
    interviews: apps.filter((a) => a.status === "Interview").length,
    offers: apps.filter((a) => a.status === "Offer").length,
    upcoming: apps
      .filter(
        (a) =>
          a.deadline &&
          a.deadline >= today &&
          !["Rejected", "Withdrawn", "Offer"].includes(a.status),
      )
      .sort((a, b) => a.deadline.localeCompare(b.deadline)),
  };
}
export function applicationDraft(
  status: Application["status"] = "Saved",
  job?: Job,
): Application {
  return {
    id: crypto.randomUUID(),
    company_id: job?.company_id || null,
    company: job?.company || "",
    title: job?.title || "",
    location: job?.location || "",
    description: job?.description || "",
    type: job?.type || "Internship",
    source: job?.source || "Manual entry",
    url: job?.url || "",
    deadline: job?.deadline || "",
    job_id: job?.id || null,
    status,
    notes: "",
    important_date: "",
    applied_on: "",
    created_at: new Date().toISOString(),
    attempt: 1,
  };
}
