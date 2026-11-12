// Database rows derived from the checked-in initial schema + 002_application_tracking.sql.
// Regenerate from the deployed schema after applying 002 if additional schema changes exist.
import type {
  Application,
  Company,
  Job,
  Profile,
  Resume,
  Activity,
} from "./models";
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};
export type ApplicationRow = Omit<Application, "applied_on"> & {
  user_id: string;
  applied_on: string | null;
  resume_id: string | null;
  updated_at: string;
};
export type JobRow = Omit<Job, "deadline"> & { deadline: string | null };
export type Database = {
  public: {
    Tables: {
      applications: Table<ApplicationRow>;
      companies: Table<Company>;
      jobs: Table<JobRow>;
      user_jobs: Table<{
        id: string;
        user_id: string;
        job_id: string;
        created_at: string;
      }>;
      profiles: Table<Profile & { id: string; created_at: string }>;
      resumes: Table<Resume & { user_id: string }>;
      application_events: Table<Activity & { user_id: string }>;
      interviews: Table<{
        id: string;
        user_id: string;
        application_id: string;
        scheduled_at: string;
        format: string;
        notes: string;
        created_at: string;
      }>;
      resume_versions: Table<{
        id: string;
        user_id: string;
        resume_id: string;
        document_id: string;
        label: string;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      save_tracking_application: {
        Args: { p_data: Json; p_create: boolean };
        Returns: string;
      };
      save_tracking_job: {
        Args: { p_data: Json; p_create: boolean };
        Returns: string;
      };
      resolve_tracking_company: {
        Args: { p_id: string | null; p_name: string };
        Returns: string;
      };
    };
    Enums: { application_status: Application["status"] };
    CompositeTypes: Record<string, never>;
  };
};
