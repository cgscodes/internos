import { authorized } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/auth/origin";
import { importRowSchema } from "@/lib/pdf/tracker";
import { TrackingError } from "@/lib/services/errors";
import { databaseError } from "@/lib/services/errors";

export const maxDuration = 60;

export async function POST(request: Request) {
  const respond = (body: object, status = 200) =>
    Response.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  if (!isSameOrigin(request)) return respond({ error: "Invalid origin" }, 403);
  try {
    const { client } = await authorized();
    const startedAt = Date.now();
    // Bound the streamed body even when Content-Length is absent or forged.
    const reader = request.body?.getReader();
    if (!reader) return respond({ error: "Missing import records" }, 400);
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1024 * 1024) {
          await reader.cancel();
          return respond({ error: "Import request exceeds 1 MB" }, 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (
      !Array.isArray(body.rows) ||
      !body.rows.length ||
      body.rows.length > 500
    )
      return respond({ error: "Select between 1 and 500 rows" }, 400);
    const results: {
      row: number;
      id?: string;
      outcome: string;
      error?: string;
    }[] = [];
    for (const [row, input] of body.rows.entries()) {
      if (Date.now() - startedAt > 45000) {
        results.push({
          row,
          outcome: "error",
          error: "Not attempted within the processing limit. Retry this row.",
        });
        continue;
      }
      const parsed = importRowSchema.safeParse(input);
      if (!parsed.success) {
        results.push({
          row,
          outcome: "error",
          error: parsed.error.issues[0].message,
        });
        continue;
      }
      try {
        const { data, error } = await client
          .rpc("import_tracking_application", {
            p_data: parsed.data,
          })
          .abortSignal(AbortSignal.timeout(10000));
        databaseError(error);
        results.push({ row, ...(data as { id: string; outcome: string }) });
      } catch (error) {
        results.push({
          row,
          outcome: "error",
          error:
            error instanceof TrackingError
              ? error.message
              : "Unable to import this row. Retry after checking your connection.",
        });
      }
    }
    return respond({ results });
  } catch (error) {
    return respond(
      {
        error:
          error instanceof Error && error.message === "Unauthorized"
            ? "Sign in before importing"
            : "Unable to process import request",
      },
      error instanceof Error && error.message === "Unauthorized" ? 401 : 400,
    );
  }
}
