import { isSameOrigin } from "@/lib/auth/origin";
import { getWorkspace } from "@/lib/services/workspace";
import { mutateWorkspace } from "@/lib/services/tracking";
import { mutationSchema } from "@/lib/validation/tracking";
import { TrackingError } from "@/lib/services/errors";
import { z } from "zod";
function failure(error: unknown) {
  const status =
    error instanceof TrackingError
      ? error.status
      : error instanceof Error && error.message === "Unauthorized"
        ? 401
        : error instanceof z.ZodError || error instanceof SyntaxError
          ? 400
          : 500;
  const message =
    error instanceof TrackingError
      ? error.message
      : status === 401
        ? "Your session has expired. Please sign in again."
        : error instanceof z.ZodError
          ? error.issues[0].message
          : status === 400
            ? "Invalid request."
            : "Unable to refresh the workspace. If you just saved a change, reload before trying again.";
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function GET() {
  try {
    return Response.json(await getWorkspace(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const mutation = mutationSchema.parse(await request.json());
    await mutateWorkspace(mutation);
    return Response.json(await getWorkspace(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
