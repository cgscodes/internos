import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { authorized } from "@/lib/supabase/server";
import type { Workspace } from "@/lib/models";
import { userIdentity } from "@/lib/auth/identity";
import { databaseError } from "./errors";

async function allRows<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await query(offset, offset + 499);
    databaseError(result.error);
    rows.push(...(result.data || []));
    if ((result.data?.length || 0) < 500) return rows;
  }
}
export async function getWorkspace(): Promise<Workspace> {
  const { client, user } = await authorized();
  const [applications, jobs, companies, bookmarks, resumes, events, profile] =
    await Promise.all([
      allRows((from, to) =>
        client
          .from("applications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
      allRows((from, to) =>
        client
          .from("jobs")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
      allRows((from, to) =>
        client
          .from("companies")
          .select("*")
          .order("name")
          .order("id")
          .range(from, to),
      ),
      allRows((from, to) =>
        client
          .from("user_jobs")
          .select("*")
          .eq("user_id", user.id)
          .order("id")
          .range(from, to),
      ),
      allRows((from, to) =>
        client
          .from("resumes")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
      allRows((from, to) =>
        client
          .from("application_events")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
      client.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    ]);
  databaseError(profile.error);
  return {
    applications: applications.map((a) => ({
      ...a,
      applied_on: a.applied_on || "",
      description: a.description || "",
    })),
    jobs: jobs.map((job) => ({ ...job, deadline: job.deadline || "" })),
    companies,
    bookmarks: bookmarks.map((b) => b.job_id),
    resumes,
    events,
    profile: {
      full_name: profile.data?.full_name || userIdentity(user).full_name,
      education: profile.data?.education || "",
      skills: profile.data?.skills || "",
      interests: profile.data?.interests || "",
      locations: profile.data?.locations || "",
    },
    email: user.email,
    identity: userIdentity(user),
  };
}
