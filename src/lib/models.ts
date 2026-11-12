import type { z } from "zod";
import {
  applicationSchema,
  jobSchema,
  profileSchema,
} from "./validation/tracking.ts";
export {
  applicationSchema,
  jobSchema,
  profileSchema,
  statuses,
} from "./validation/tracking.ts";
export type Application = z.infer<typeof applicationSchema>;
export type Job = z.infer<typeof jobSchema> & {
  created_by: string | null;
  created_at: string;
};
export type Company = {
  id: string;
  name: string;
  website: string | null;
  created_by: string | null;
  created_at: string;
};
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
  from_status?: Application["status"] | null;
  to_status?: Application["status"] | null;
};
export type Workspace = {
  applications: Application[];
  jobs: Job[];
  companies: Company[];
  bookmarks: string[];
  resumes: Resume[];
  events: Activity[];
  profile: Profile;
  email?: string;
  identity?: { id: string; full_name: string; avatar_url: string | null };
};
