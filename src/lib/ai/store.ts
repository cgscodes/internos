import "server-only";
import { z } from "zod";
import { authorized } from "../supabase/server";
import type { Json, JobMatchRow } from "../database.types";
import {
  MatchError,
  MATCH_MODEL,
  MATCH_VERSION,
  modelAnalysisSchema,
  type MatchAnalysis,
} from "./contracts.ts";
import type { MatchStore } from "./service.ts";

function checked(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "55P03")
    throw new MatchError(
      "A match analysis is already running. Wait for it to finish.",
      409,
      "already_running",
    );
  if (error.code === "53300")
    throw new MatchError(
      "You've reached 10 match requests in 10 minutes. Please wait before trying again.",
      429,
      "rate_limit",
    );
  if (["P0002", "42501", "23503"].includes(error.code || ""))
    throw new MatchError(
      "Job or resume not found for your account. Bookmark the job and select your own resume.",
      404,
      "not_found",
    );
  if (["42P01", "PGRST202", "42703"].includes(error.code || ""))
    throw new MatchError(
      "AI matching needs database migration 005. Apply it and reload.",
      503,
      "migration_required",
    );
  throw new MatchError(
    "Unable to save or load the analysis. Try again.",
    503,
    "persistence_error",
  );
}
const findingsSchema = modelAnalysisSchema.extend({
  match_score: z.int().min(0).max(100),
  eligibility_status: z.enum([
    "Meets stated requirements",
    "Potential mismatch",
    "Unknown",
  ]),
});
function saved(row: JobMatchRow): MatchAnalysis {
  return {
    ...row,
    findings: findingsSchema.parse(row.findings),
    usage: z.record(z.string(), z.number().nonnegative()).parse(row.usage),
  };
}
export async function authorizedMatchStore(): Promise<MatchStore> {
  const { client, user } = await authorized();
  return {
    userId: user.id,
    async begin(jobId, resumeId) {
      const { data, error } = await client
        .rpc("begin_job_match", { p_job_id: jobId, p_resume_id: resumeId })
        .abortSignal(AbortSignal.timeout(5000));
      checked(error);
      return data!;
    },
    async end(lease) {
      const { error } = await client
        .rpc("end_job_match", { p_lease: lease })
        .abortSignal(AbortSignal.timeout(5000));
      checked(error);
    },
    async job(id) {
      const { data: bookmark, error: bookmarkError } = await client
        .from("user_jobs")
        .select("id")
        .eq("user_id", user.id)
        .eq("job_id", id)
        .abortSignal(AbortSignal.timeout(5000))
        .maybeSingle();
      checked(bookmarkError);
      if (!bookmark) return null;
      const { data, error } = await client
        .from("jobs")
        .select("id,title,description,location,type")
        .eq("id", id)
        .abortSignal(AbortSignal.timeout(5000))
        .maybeSingle();
      checked(error);
      return data;
    },
    async resume(id) {
      const { data, error } = await client
        .from("resumes")
        .select("id,file_name,storage_path,size")
        .eq("user_id", user.id)
        .eq("id", id)
        .abortSignal(AbortSignal.timeout(5000))
        .maybeSingle();
      checked(error);
      return data;
    },
    async fullName() {
      const { data, error } = await client
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .abortSignal(AbortSignal.timeout(5000))
        .maybeSingle();
      checked(error);
      return data?.full_name || "";
    },
    async download(resume, signal) {
      // Signed URL is generated from the owner-scoped database row, never supplied by the browser.
      const { data, error } = await client.storage
        .from("resumes")
        .createSignedUrl(resume.storage_path, 60);
      if (error || !data)
        throw new MatchError(
          "Unable to open this saved resume. Upload it again and retry.",
          422,
          "missing_resume",
        );
      const response = await fetch(data.signedUrl, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        cache: "no-store",
        redirect: "error",
      });
      if (!response.ok || !response.body)
        throw new MatchError(
          "Unable to read this saved resume. Upload it again and retry.",
          422,
          "missing_resume",
        );
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 5 * 1024 * 1024) {
            await reader.cancel();
            throw new MatchError("Resume exceeds 5 MB.", 422);
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
      return bytes;
    },
    async extract(bytes, signal) {
      try {
        const { extractPdfLayout } = await import("../pdf/extract.ts");
        return (await extractPdfLayout(bytes, signal)).text;
      } catch {
        throw new MatchError(
          "This resume could not be read. Upload an unencrypted, selectable-text PDF with at most 40 pages and 19,000 extracted characters.",
          422,
          "unreadable_resume",
        );
      }
    },
    async cached(hash) {
      const { data, error } = await client
        .from("job_match_analyses")
        .select("*")
        .eq("user_id", user.id)
        .eq("input_hash", hash)
        .abortSignal(AbortSignal.timeout(5000))
        .maybeSingle();
      checked(error);
      return data ? saved(data) : null;
    },
    async latest(jobId, resumeId, jobHash) {
      const { data, error } = await client
        .from("job_match_analyses")
        .select("*")
        .eq("user_id", user.id)
        .eq("job_id", jobId)
        .eq("resume_id", resumeId)
        .eq("job_hash", jobHash)
        .eq("model", MATCH_MODEL)
        .eq("prompt_version", MATCH_VERSION)
        .order("created_at", { ascending: false })
        .limit(1)
        .abortSignal(AbortSignal.timeout(5000))
        .maybeSingle();
      checked(error);
      return data ? saved(data) : null;
    },
    async save(data) {
      const { data: row, error } = await client
        .from("job_match_analyses")
        .upsert(
          {
            ...data,
            findings: data.findings as unknown as Json,
            usage: data.usage,
            created_at: new Date().toISOString(),
          },
          { onConflict: "user_id,input_hash" },
        )
        .select("*")
        .abortSignal(AbortSignal.timeout(5000))
        .single();
      checked(error);
      return saved(row!);
    },
  };
}
