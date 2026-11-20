import {
  MATCH_VERSION,
  MatchError,
  matchRequestSchema,
  type MatchAnalysis,
  type MatchProvider,
} from "./contracts.ts";
import {
  digest,
  inputDigest,
  jobContent,
  minimizeResume,
  validateAnalysis,
  validateSourceText,
  validateJobText,
} from "./analysis.ts";

export type MatchJob = {
  id: string;
  title: string;
  description: string;
  location: string;
  type: string;
};
export type MatchResume = {
  id: string;
  file_name: string;
  storage_path: string;
  size: number;
};
export interface MatchStore {
  userId: string;
  begin(jobId: string, resumeId: string): Promise<string>;
  end(lease: string): Promise<void>;
  job(id: string): Promise<MatchJob | null>;
  resume(id: string): Promise<MatchResume | null>;
  download(resume: MatchResume, signal: AbortSignal): Promise<Uint8Array>;
  extract(bytes: Uint8Array, signal: AbortSignal): Promise<string>;
  fullName(): Promise<string>;
  cached(hash: string): Promise<MatchAnalysis | null>;
  save(data: Omit<MatchAnalysis, "id" | "created_at">): Promise<MatchAnalysis>;
  latest(
    jobId: string,
    resumeId: string,
    jobHash: string,
  ): Promise<MatchAnalysis | null>;
}
export async function analyzeMatch(
  store: MatchStore,
  provider: MatchProvider,
  request: unknown,
  signal: AbortSignal,
) {
  const args = matchRequestSchema.parse(request);
  const lease = await store.begin(args.job_id, args.resume_id);
  try {
    const [job, resume] = await Promise.all([
      store.job(args.job_id),
      store.resume(args.resume_id),
    ]);
    if (!job)
      throw new MatchError(
        "Bookmark an accessible job before analyzing its match.",
        404,
        "not_found",
      );
    if (!resume)
      throw new MatchError(
        "Select one of your saved resumes, or upload a resume first.",
        404,
        "missing_resume",
      );
    if (!resume.storage_path.startsWith(`${store.userId}/`))
      throw new MatchError("Resume not found.", 404, "not_found");
    // Existing resume versions are separate uploaded rows. Their file bytes also enter the cache key.
    if (!/\.pdf$/i.test(resume.file_name))
      throw new MatchError(
        "For matching, export this resume as a selectable-text PDF and upload it as a new version. DOCX matching is not supported yet.",
        422,
        "unsupported_resume",
      );
    if (resume.size > 5 * 1024 * 1024)
      throw new MatchError("Use a resume up to 5 MB.", 422);
    validateJobText(job.description);
    const bytes = await store.download(resume, signal);
    if (!bytes.length || bytes.length > 5 * 1024 * 1024)
      throw new MatchError("Use a nonempty resume up to 5 MB.", 422);
    const jobHash = digest(jobContent(job)),
      resumeHash = digest(bytes);
    const hash = inputDigest(
      jobHash,
      resumeHash,
      provider.model,
      args.job_id,
      args.resume_id,
    );
    if (!args.refresh) {
      const cached = await store.cached(hash);
      if (cached) return { analysis: cached, cached: true };
    }
    const [text, name] = await Promise.all([
      store.extract(bytes, signal),
      store.fullName(),
    ]);
    const input = {
      resume: minimizeResume(text, name),
      job: [job.title, job.type, job.location, job.description].join("\n"),
    };
    validateSourceText(input.resume, job.description);
    signal.throwIfAborted();
    const result = await provider.analyze(input, signal);
    signal.throwIfAborted();
    const findings = validateAnalysis(result.text, input);
    // Recheck ownership/content after inference so an edited/deleted job cannot receive a stale snapshot.
    const current = await store.job(job.id);
    if (!current || digest(jobContent(current)) !== jobHash)
      throw new MatchError(
        "This job changed during analysis. Analyze the updated description again.",
        409,
        "content_changed",
      );
    const analysis = await store.save({
      user_id: store.userId,
      job_id: job.id,
      resume_id: resume.id,
      model: provider.model,
      prompt_version: MATCH_VERSION,
      input_hash: hash,
      job_hash: jobHash,
      resume_hash: resumeHash,
      match_score: findings.match_score,
      findings,
      usage: result.usage,
    });
    return { analysis, cached: false };
  } finally {
    await store.end(lease).catch(() => {});
  }
}
