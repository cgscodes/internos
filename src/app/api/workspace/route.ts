import { authorized } from "@/lib/supabase/server";
import { applicationSchema, profileSchema } from "@/lib/models";
import { getWorkspace } from "@/lib/services/workspace";
import { z } from "zod";
export async function GET() {
  try {
    return Response.json(await getWorkspace(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Unable to load workspace" },
      {
        status: e instanceof Error && e.message === "Unauthorized" ? 401 : 500,
      },
    );
  }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return Response.json({ error: "Invalid origin" }, { status: 403 });
    const { client, user } = await authorized();
    const body = await request.json();
    if (body.action === "profile") {
      const profile = profileSchema.parse(body.data);
      const { error } = await client
        .from("profiles")
        .update(profile)
        .eq("id", user.id);
      if (error) throw error;
    } else if (body.action === "delete") {
      const id = z.uuid().parse(body.id);
      const { error } = await client
        .from("applications")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    } else if (body.action === "application") {
      const data = applicationSchema.parse(body.data);
      const { error } = await client
        .from("applications")
        .upsert({ ...data, user_id: user.id }, { onConflict: "id" });
      if (error) throw error;
    } else return Response.json({ error: "Unknown action" }, { status: 400 });
    return Response.json(await getWorkspace());
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof z.ZodError
            ? e.issues[0].message
            : e instanceof Error
              ? e.message
              : "Unable to save changes",
      },
      {
        status: e instanceof Error && e.message === "Unauthorized" ? 401 : 400,
      },
    );
  }
}
