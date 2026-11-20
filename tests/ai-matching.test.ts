import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeMatch, type MatchStore } from "../src/lib/ai/service.ts";
import { handleMatchRequest } from "../src/lib/ai/http.ts";
import {
  validateAnalysis,
  minimizeResume,
  digest,
  jobContent,
  MATCH_SYSTEM_PROMPT,
} from "../src/lib/ai/analysis.ts";
import {
  MATCH_MODEL,
  MatchError,
  type MatchAnalysis,
  type MatchProvider,
} from "../src/lib/ai/contracts.ts";
import { providerFailure } from "../src/lib/ai/provider-error.ts";
import {
  modelFindings,
  resumeText,
  jobDescription,
} from "./helpers/ai-match.mjs";

const user = crypto.randomUUID(),
  jobId = crypto.randomUUID(),
  resumeId = crypto.randomUUID();
function harness() {
  let cached: MatchAnalysis | null = null,
    calls = 0,
    ended = 0,
    saved = 0;
  const job = {
    id: jobId,
    title: "Engineer",
    description: jobDescription,
    location: "Remote",
    type: "Internship",
  };
  const store: MatchStore = {
    userId: user,
    begin: async () => crypto.randomUUID(),
    end: async () => {
      ended++;
    },
    job: async () => job,
    resume: async () => ({
      id: resumeId,
      file_name: "resume.pdf",
      storage_path: `${user}/resume.pdf`,
      size: 100,
    }),
    download: async () => new TextEncoder().encode("real saved PDF bytes"),
    extract: async () => resumeText,
    fullName: async () => "Alex Example",
    cached: async () => cached,
    latest: async () => cached,
    save: async (data) => {
      saved++;
      cached = {
        ...data,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      };
      return cached;
    },
  };
  const provider: MatchProvider = {
    model: MATCH_MODEL,
    analyze: async () => {
      calls++;
      return {
        text: JSON.stringify(modelFindings()),
        usage: { totalTokenCount: 400 },
      };
    },
  };
  return { store, provider, job, counts: () => ({ calls, ended, saved }) };
}
const args = { job_id: jobId, resume_id: resumeId };
const signal = () => AbortSignal.timeout(5000);
const request = (data: unknown, origin = "http://localhost") =>
  new Request("http://localhost/api/ai/match", {
    method: "POST",
    headers: { Origin: origin },
    body: JSON.stringify(data),
  });

test("valid matching persists grounded findings, usage, resume version and weighted heuristic score; identical content uses cache", async () => {
  const h = harness();
  const first = await analyzeMatch(h.store, h.provider, args, signal());
  assert.equal(first.analysis.match_score, 78);
  assert.equal(first.analysis.findings.eligibility_status, "Unknown");
  assert.equal(first.analysis.resume_id, resumeId);
  assert.equal(first.analysis.usage.totalTokenCount, 400);
  assert.equal(first.analysis.job_hash, digest(jobContent(h.job)));
  assert.equal(first.cached, false);
  assert.equal(
    (await analyzeMatch(h.store, h.provider, args, signal())).cached,
    true,
  );
  assert.deepEqual(h.counts(), { calls: 1, saved: 1, ended: 2 });
  await analyzeMatch(h.store, h.provider, { ...args, refresh: true }, signal());
  assert.equal(h.counts().calls, 2);
});

test("missing resume, incomplete descriptions and empty extraction never reach the provider", async () => {
  for (const kind of [
    "resume",
    "description",
    "text",
    "foreign_path",
    "docx",
  ] as const) {
    const h = harness();
    if (kind === "resume") h.store.resume = async () => null;
    if (kind === "description") h.job.description = "Engineering opportunity";
    if (kind === "text") h.store.extract = async () => "";
    if (kind === "foreign_path")
      h.store.resume = async () => ({
        id: resumeId,
        file_name: "resume.pdf",
        size: 100,
        storage_path: `${crypto.randomUUID()}/private.pdf`,
      });
    if (kind === "docx")
      h.store.resume = async () => ({
        id: resumeId,
        file_name: "resume.docx",
        size: 100,
        storage_path: `${user}/resume.docx`,
      });
    await assert.rejects(
      () => analyzeMatch(h.store, h.provider, args, signal()),
      MatchError,
    );
    assert.equal(h.counts().calls, 0);
    assert.equal(h.counts().saved, 0);
    assert.equal(h.counts().ended, 1);
  }
});

test("missing eligibility evidence is Unknown, while Not met requires explicit evidence on both sides", () => {
  const output = modelFindings();
  output.eligibility_checks[2].status = "Not met";
  const result = validateAnalysis(JSON.stringify(output), {
    resume: resumeText,
    job: jobDescription,
  });
  assert.equal(result.eligibility_checks[2].status, "Unknown");
  assert.equal(result.eligibility_status, "Unknown");
});

test("malformed JSON, invalid scores, invented evidence and insufficient job detail are never saved", async () => {
  for (const raw of [
    "not json",
    JSON.stringify({ ...modelFindings(), skills_score: 101 }),
    JSON.stringify({
      ...modelFindings(),
      relevant_skills: [
        {
          finding: "Invented",
          job_evidence: "TypeScript",
          resume_evidence: "Certified expert with 10 years",
        },
      ],
    }),
    JSON.stringify({ ...modelFindings(), information_sufficient: false }),
  ]) {
    const h = harness();
    h.provider.analyze = async () => ({ text: raw, usage: {} });
    await assert.rejects(
      () => analyzeMatch(h.store, h.provider, args, signal()),
      MatchError,
    );
    assert.equal(h.counts().saved, 0);
    assert.equal(h.counts().ended, 1);
  }
});

test("quota and timeout errors are actionable and never leak private provider messages", async () => {
  const quota = providerFailure({
    status: 429,
    message: "SECRET private resume content",
  });
  assert.equal(quota.status, 429);
  assert.doesNotMatch(quota.message, /SECRET/);
  const timeout = providerFailure(
    new DOMException("private text", "TimeoutError"),
  );
  assert.equal(timeout.status, 504);
  const h = harness();
  h.provider.analyze = async () => {
    throw quota;
  };
  const response = await handleMatchRequest(request(args), {
    authorize: async () => h.store,
    provider: h.provider,
  });
  assert.equal(response.status, 429);
  assert.ok(response.headers.get("Retry-After"));
  assert.equal(h.counts().saved, 0);
  assert.equal(h.counts().ended, 1);
});

test("unauthorized, foreign-origin, forged fields and oversized requests cannot invoke matching", async () => {
  const h = harness();
  let authenticated = 0;
  const authorize = async () => {
    authenticated++;
    throw new Error("Unauthorized");
  };
  assert.equal(
    (
      await handleMatchRequest(request(args), {
        authorize,
        provider: h.provider,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await handleMatchRequest(request(args, "https://evil.test"), {
        authorize,
        provider: h.provider,
      })
    ).status,
    403,
  );
  assert.equal(authenticated, 1);
  for (const [body, expected] of [
    [{ ...args, user_id: user }, 400],
    [{ ...args, resume_text: "x".repeat(5000) }, 413],
  ] as const) {
    assert.equal(
      (
        await handleMatchRequest(request(body), {
          authorize: async () => h.store,
          provider: h.provider,
        })
      ).status,
      expected,
    );
  }
  assert.equal(h.counts().calls, 0);
});

test("rate limits and duplicate requests stop before extraction or model use", async () => {
  for (const [status, code] of [
    [429, "rate_limit"],
    [409, "already_running"],
  ] as const) {
    const h = harness();
    h.store.begin = async () => {
      throw new MatchError("Please wait.", status, code);
    };
    const response = await handleMatchRequest(request(args), {
      authorize: async () => h.store,
      provider: h.provider,
    });
    assert.equal(response.status, status);
    assert.equal(h.counts().calls, 0);
  }
});

test("job changes during inference cannot persist a stale score; changed job and resume bytes invalidate cache keys", async () => {
  const h = harness();
  const hashes: string[] = [];
  h.store.cached = async (hash) => {
    hashes.push(hash);
    return null;
  };
  await analyzeMatch(h.store, h.provider, args, signal());
  h.job.description += " Additional documented requirements.";
  await analyzeMatch(h.store, h.provider, args, signal());
  h.store.download = async () =>
    new TextEncoder().encode("different saved file bytes");
  await analyzeMatch(h.store, h.provider, args, signal());
  assert.equal(new Set(hashes).size, 3);
  const anotherResumeId = crypto.randomUUID();
  h.store.resume = async () => ({
    id: anotherResumeId,
    file_name: "same.pdf",
    storage_path: `${user}/same.pdf`,
    size: 100,
  });
  await analyzeMatch(
    h.store,
    h.provider,
    { ...args, resume_id: anotherResumeId },
    signal(),
  );
  assert.equal(new Set(hashes).size, 4); // Identical bytes on a different saved version retain the selected version reference.
  h.provider.analyze = async () => {
    h.job.description += " Changed during inference.";
    return { text: JSON.stringify(modelFindings()), usage: {} };
  };
  await assert.rejects(
    () => analyzeMatch(h.store, h.provider, args, signal()),
    /changed during analysis/,
  );
});

test("contact minimization retains education dates and prompt treats documents as untrusted evidence", () => {
  const result = minimizeResume(
    "Alex Example\nalex@example.test\n+1 (555) 123-4567\nGraduation: 2027-05-20\nEducation 2023-2027\nGender: private\nTypeScript",
    "Alex Example",
  );
  assert.doesNotMatch(result, /Alex Example|alex@example|555|Gender/);
  assert.match(result, /2027-05-20/);
  assert.match(result, /2023-2027/);
  assert.match(MATCH_SYSTEM_PROMPT, /UNTRUSTED DATA/);
  assert.match(MATCH_SYSTEM_PROMPT, /never inferred from a name/);
});
