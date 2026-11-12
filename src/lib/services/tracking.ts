import "server-only";
import { authorized } from "@/lib/supabase/server";
import type { WorkspaceMutation } from "@/lib/validation/tracking";
import { databaseError, TrackingError } from "./errors";

export async function mutateWorkspace(mutation: WorkspaceMutation) {
  const { client, user } = await authorized();
  if (
    mutation.action === "application.create" ||
    mutation.action === "application.update"
  ) {
    const { error } = await client.rpc("save_tracking_application", {
      p_data: mutation.data,
      p_create: mutation.action === "application.create",
    });
    databaseError(error);
  } else if (
    mutation.action === "job.create" ||
    mutation.action === "job.update"
  ) {
    const { error } = await client.rpc("save_tracking_job", {
      p_data: mutation.data,
      p_create: mutation.action === "job.create",
    });
    databaseError(error);
  } else if (mutation.action === "delete") {
    const { data, error } = await client
      .from("applications")
      .delete()
      .eq("id", mutation.id)
      .eq("user_id", user.id)
      .select("id");
    databaseError(error);
    if (!data?.length) throw new TrackingError("Application not found.", 404);
  } else if (mutation.action === "status") {
    const { data, error } = await client
      .from("applications")
      .update({ status: mutation.status })
      .eq("id", mutation.id)
      .eq("user_id", user.id)
      .select("id");
    databaseError(error);
    if (!data?.length) throw new TrackingError("Application not found.", 404);
  } else if (mutation.action === "bookmark") {
    if (mutation.saved) {
      const { data, error } = await client
        .from("jobs")
        .select("id")
        .eq("id", mutation.job_id)
        .maybeSingle();
      databaseError(error);
      if (!data) throw new TrackingError("Opportunity not found.", 404);
      const result = await client
        .from("user_jobs")
        .upsert(
          { user_id: user.id, job_id: mutation.job_id },
          { onConflict: "user_id,job_id", ignoreDuplicates: true },
        );
      databaseError(result.error);
    } else {
      const { error } = await client
        .from("user_jobs")
        .delete()
        .eq("user_id", user.id)
        .eq("job_id", mutation.job_id);
      databaseError(error);
    }
  } else if (mutation.action === "profile") {
    const { error } = await client
      .from("profiles")
      .upsert({ ...mutation.data, id: user.id }, { onConflict: "id" });
    databaseError(error);
  }
}
