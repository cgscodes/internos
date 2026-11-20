import { z } from "zod";
import {
  MatchError,
  matchRequestSchema,
  type MatchProvider,
} from "./contracts.ts";
import { analyzeMatch, type MatchStore } from "./service.ts";
import { digest, jobContent } from "./analysis.ts";
import { isSameOrigin } from "../auth/origin.ts";

const respond = (body: object, status = 200, retry = false) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      ...(retry ? { "Retry-After": "60" } : {}),
    },
  });
export async function readMatchRequest(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new MatchError("Select a job and resume.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) {
        await reader.cancel();
        throw new MatchError("Match request exceeds 4 KB.", 413);
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
  return matchRequestSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
}
export async function handleMatchRequest(
  request: Request,
  deps: { authorize(): Promise<MatchStore>; provider: MatchProvider },
) {
  if (request.method === "POST" && !isSameOrigin(request))
    return respond({ error: "Invalid origin" }, 403);
  try {
    const store = await deps.authorize();
    if (request.method === "GET") {
      const params = new URL(request.url).searchParams;
      const args = matchRequestSchema.parse({
        job_id: params.get("job_id"),
        resume_id: params.get("resume_id"),
      });
      const [job, resume] = await Promise.all([
        store.job(args.job_id),
        store.resume(args.resume_id),
      ]);
      if (!job || !resume)
        throw new MatchError("Job or resume not found.", 404, "not_found");
      return respond({
        analysis: await store.latest(
          job.id,
          resume.id,
          digest(jobContent(job)),
        ),
      });
    }
    const args = await readMatchRequest(request);
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(50000),
    ]);
    return respond(await analyzeMatch(store, deps.provider, args, signal));
  } catch (error) {
    if (error instanceof MatchError)
      return respond(
        { error: error.message, code: error.code },
        error.status,
        error.status === 429,
      );
    if (error instanceof Error && error.message === "Unauthorized")
      return respond({ error: "Sign in before analyzing a match." }, 401);
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return respond({ error: "Select a valid job and saved resume." }, 400);
    if (error instanceof Error && /Abort|Timeout/.test(error.name))
      return respond({ error: "Analysis timed out. Try again shortly." }, 504);
    return respond(
      {
        error:
          "Unable to analyze this match. No new analysis was saved. Try again.",
      },
      500,
    );
  }
}
