import { z } from "zod";
export const statuses = [
  "Saved",
  "Preparing",
  "Ready",
  "Applied",
  "Assessment",
  "Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
] as const;
export const dateInput = z.union([z.literal(""), z.iso.date()]);
const jobFields = {
  id: z.uuid(),
  company_id: z.uuid().nullable().default(null),
  company: z.string().trim().min(1, "Company is required").max(120),
  title: z.string().trim().min(1, "Role is required").max(160),
  location: z.string().trim().max(160),
  type: z.enum(["Internship", "Co-op", "Graduate"]),
  source: z.string().trim().max(120),
  url: z.union([
    z.literal(""),
    z
      .url()
      .refine(
        (value) => /^https?:\/\//.test(value),
        "Use an http or https link",
      ),
  ]),
  deadline: dateInput,
  description: z.string().max(20000).default(""),
};
export const jobSchema = z.object(jobFields);
export const applicationSchema = z.object({
  ...jobFields,
  job_id: z.uuid().nullable().default(null),
  status: z.enum(statuses),
  notes: z.string().max(10000),
  important_date: dateInput,
  applied_on: dateInput.default(""),
  created_at: z.iso.datetime({ offset: true }),
  attempt: z.int().positive().default(1),
});
export const profileSchema = z.object({
  full_name: z.string().trim().min(1).max(100),
  education: z.string().max(500),
  skills: z.string().max(1000),
  interests: z.string().max(500),
  locations: z.string().max(500),
});
export const mutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("application.create"),
      data: applicationSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("application.update"),
      data: applicationSchema,
    })
    .strict(),
  z.object({ action: z.literal("job.create"), data: jobSchema }).strict(),
  z.object({ action: z.literal("job.update"), data: jobSchema }).strict(),
  z.object({ action: z.literal("delete"), id: z.uuid() }).strict(),
  z
    .object({
      action: z.literal("status"),
      id: z.uuid(),
      status: z.enum(statuses),
    })
    .strict(),
  z
    .object({
      action: z.literal("bookmark"),
      job_id: z.uuid(),
      saved: z.boolean(),
    })
    .strict(),
  z.object({ action: z.literal("profile"), data: profileSchema }).strict(),
]);
export type JobInput = z.infer<typeof jobSchema>;
export type WorkspaceMutation = z.infer<typeof mutationSchema>;
