import "server-only";
import { authorized } from "@/lib/supabase/server";
import { Workspace } from "@/lib/models";
export async function getWorkspace(): Promise<Workspace> {
  const { client, user } = await authorized();
  const results = await Promise.all([
    client
      .from("applications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    client.from("jobs").select("*").order("created_at", { ascending: false }),
    client
      .from("resumes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    client
      .from("application_events")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
    client.from("profiles").select("*").eq("id", user.id).single(),
  ]);
  for (const result of results)
    if (result.error) throw new Error(result.error.message);
  return {
    applications: results[0].data ?? [],
    jobs: (results[1].data ?? []).map((j) => ({
      ...j,
      status: "Saved",
      notes: "",
      important_date: "",
      deadline: j.deadline ?? "",
      url: j.url ?? "",
    })),
    resumes: results[2].data ?? [],
    events: results[3].data ?? [],
    profile: results[4].data,
    email: user.email,
  };
}
