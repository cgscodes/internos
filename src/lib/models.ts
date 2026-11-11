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
export const applicationSchema = z.object({
  id: z.uuid(),
  company: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(160),
  location: z.string().max(160),
  type: z.enum(["Internship", "Co-op", "Graduate"]),
  source: z.string().max(120),
  url: z.union([
    z.literal(""),
    z.url().refine((v) => /^https?:\/\//.test(v), "Use an http or https link"),
  ]),
  deadline: z.union([z.literal(""), z.iso.date()]),
  status: z.enum(statuses),
  notes: z.string().max(10000),
  important_date: z.union([z.literal(""), z.iso.date()]),
  created_at: z.iso.datetime({ offset: true }),
});
export type Application = z.infer<typeof applicationSchema>;
export const profileSchema = z.object({
  full_name: z.string().trim().min(1).max(100),
  education: z.string().max(500),
  skills: z.string().max(1000),
  interests: z.string().max(500),
  locations: z.string().max(500),
});
export type Profile = z.infer<typeof profileSchema>;
export type Resume = {
  id: string;
  name: string;
  file_name: string;
  size: number;
  storage_path: string;
  is_master: boolean;
  created_at: string;
  parent_id?: string | null;
};
export type Activity = {
  id: string;
  application_id: string;
  description: string;
  created_at: string;
};
export type Workspace = {
  applications: Application[];
  jobs: Application[];
  resumes: Resume[];
  events: Activity[];
  profile: Profile;
  email?: string;
};
