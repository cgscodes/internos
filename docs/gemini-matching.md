# Phase 4.1 — Gemini resume-to-job matching

## Behavior and scope

Bookmark a job in Discover, open its details, select an uploaded resume version, and choose **Analyze Match**. The panel shows a persisted fit estimate, separate eligibility checks, grounded strengths, qualifications not evidenced in the resume, score explanation, suggested emphasis, a next action, and the analysis time. **Analyze Again** explicitly requests fresh inference. Ordinary Analyze Match returns a cached result when the job content, uploaded file bytes, selected job/resume identities, model, and prompt version are unchanged.

The selected `resumes.id` identifies the actual uploaded version; the existing `parent_id` and `resume_versions` relationships remain intact. Matching currently reads selectable-text PDFs only (5 MB, 40 pages, 19,000 extracted characters). For DOCX, scanned, encrypted, or unreadable documents, the panel asks for a selectable-text PDF uploaded as a new version. There is no OCR, invented resume text, or fallback analysis. Upload/download support for DOCX elsewhere in the app is unchanged.

Descriptions need at least 200 characters and 30 words. Gemini must also judge whether the description contains substantive requirements and responsibilities. Insufficient descriptions produce an actionable error without a score. A failed analysis never replaces a saved result; a prior result stays clearly labeled as a saved snapshot. The initial read retrieves a saved snapshot for the selected version and matching job content; Analyze Match checks the actual stored file bytes before using the cache.

No resume rewriting, letters, Gmail, job discovery, automatic applications, native changes, or IPA build are included. Application history, PDF import parsing, and the Sankey are unchanged.

## Provider and scoring

The official `@google/genai` SDK uses the pinned `gemini-3.8-flash` model. Its identifier and structured-output support were checked against Google's [model documentation](https://aistudio.google.com/docs/models/gemini-3.8-flash). The SDK's [GenerateContentConfig](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html) supports `responseJsonSchema`, abort signals, output limits, and system instructions. No OpenAI or Claude integration is included.

`MatchProvider` in `src/lib/ai/contracts.ts` is independent of Gemini. `gemini.ts` implements that contract and is marked server-only. The service orchestrates authorization, source extraction, hashing, validation, inference, and persistence through the `MatchStore` interface. HTTP/auth and Supabase adapters remain separate so tests can inject a provider and store without making network calls to Gemini.

Gemini produces three bounded component scores. The server computes the final heuristic estimate:

- Documented skill alignment: 50%.
- Documented experience alignment: 35%.
- Role/context alignment: 15%.

The result is rounded to an integer from 0–100. The prompt anchors 0 as no documented alignment, 50 as partial evidence, and 100 as strong direct evidence. These are subjective evidence-fit estimates, not hiring probabilities, validated predictive scores, or ATS scores. Missing evidence can reduce documented fit but is never described as proof of lacking experience.

Eligibility is assessed separately across degree level, graduation date, work authorization, technical skills, location, and availability. Missing or ambiguous evidence becomes Unknown. A potential mismatch requires explicit job and resume evidence; no information is inferred from protected characteristics. The server forces Unknown when either side's evidence is absent. It validates the schema, all six distinct categories, component ranges, and literal evidence quotes. Strengths and suggested emphasis require quotes from both documents. Missing qualifications require an explicit job quote and are labeled as not evidenced. Semantic judgments still require human review; literal quote validation cannot prove the model's interpretation is correct.

## Migration and persistence

Apply `supabase/migrations/005_ai_job_matching.sql` after the existing initial, 002, 003, and 004 migrations. Do not modify or rerun old migrations and do not reset or seed a production database.

`job_match_analyses` stores completed snapshots with the authenticated user, job, resume version, model, prompt version, SHA-256 job/file/input hashes, timestamp, score, structured findings, and numeric token usage metadata. A fresh analysis of identical input updates that snapshot and timestamp; changed inputs create a separate snapshot. It does not store a second full copy of resume text. Findings contain supporting excerpts and should be treated as private resume information. Deleting the referenced resume or job cascades to its analyses.

RLS limits analyses to their owner and visible jobs; insert/update also requires the owner's saved-job relationship. A composite foreign key prevents references to someone else's resume. No service-role credential is used.

`ai_match_limits` has RLS and no direct authenticated table privileges. Narrow, pinned-search-path security-definer RPCs validate the current user, owned resume, job visibility, and bookmark before changing the caller's quota state. A per-user transaction lock serializes admission. The state permits 10 analysis requests per 10 minutes (including cache checks and failed requests), with one active request per user. An unpredictable 90-second lease prevents duplicate simultaneous requests and expires after a crashed process. Only the matching lease can release the request. Deleting analyses does not reset quotas. Cached history reads do not reserve inference capacity.

## Security and privacy

Every GET/POST verifies Supabase authentication. POST enforces same-origin requests and streams a maximum 4 KB body containing only job/resume UUIDs and an optional refresh flag. The server loads actual job and resume records, rechecks bookmark/visibility, validates the owner-prefixed storage path, and downloads through a short-lived private storage URL. The browser never supplies arbitrary file URLs or source text to the matching endpoint.

Resume extraction reuses the existing data-only PDF reader; it does not execute PDF actions, follow URLs, render documents, or send PDFs to Gemini. The server strips recognized contact links, email addresses, phone numbers, a matching profile name, and labeled sensitive lines. This is best-effort minimization, not guaranteed anonymization. Users see that resume text and the job description will be sent to Google before choosing Analyze. Profile fields are not otherwise included, and application records, notes, other resume versions, and unrelated documents are never sent. Private content and provider exceptions are not logged or returned verbatim.

Job and resume text are JSON-encoded data beneath a fixed system instruction, with no tools or URL retrieval. The prompt rejects embedded instructions and sensitive-characteristic inference. Structured JSON plus grounding checks reduce injection risk; they cannot guarantee semantic immunity to malicious text. The model has no write tools or autonomous actions. Its results are advisory and require user review.

Requests have a 50-second analysis signal, 25-second SDK timeout, bounded database operations, 10-second streamed download timeout, and PDF extraction limits. The SDK performs one attempt, requests one bounded output, disables automatic continuation, and sets `store: false`. The endpoint allows 60 seconds for processing and cleanup. Provider quota, timeout, invalid-output, incomplete-source, and persistence errors have safe messages. An interrupted provider request may still incur provider charges; limits and leases bound repeated requests but cannot cancel billing already underway.

`GEMINI_API_KEY` is read only inside the server-only Gemini adapter. Do not use `NEXT_PUBLIC_GEMINI_API_KEY`. The public Supabase project key and existing verified session are sufficient for persistence; never configure a service-role key.

## Changed files

- `.env.example`, `package.json`, `package-lock.json`: Gemini configuration and SDK dependency.
- `next.config.ts`: keep PDF.js external on the server and include its native worker in the matching route deployment trace.
- `src/lib/ai/contracts.ts`, `analysis.ts`, `gemini.ts`, `provider-error.ts`, `service.ts`, `http.ts`, `store.ts`: schemas, provider contract/adapter, evidence validation, scoring, HTTP boundary, orchestration, and authenticated persistence.
- `src/app/api/ai/match/route.ts`: authenticated read/analyze endpoint.
- `src/components/job-match-panel.tsx`, `src/app/(workspace)/discover/page.tsx`, `src/app/(workspace)/settings/page.tsx`, `src/app/globals.css`: job-details panel and restrained styles using the existing design tokens.
- `src/lib/database.types.ts`, `supabase/migrations/005_ai_job_matching.sql`: additive database contracts and migration.
- `tests/ai-matching.test.ts`, `tests/ai-matching-database.test.ts`, `tests/helpers/ai-match.mjs`, `tests/e2e/ai-match.spec.ts`: focused matching regressions.
- `tests/helpers/database.mjs`, `tests/helpers/supabase-mock.mjs`, `playwright.config.ts`: apply the new migration, preserve quota table restrictions, support test-only private storage/RPCs, and run matching tests with Gemini disabled.
- `README.md`, `docs/gemini-matching.md`: current feature status, implementation, and deployment guide.

## Validation and live verification

Automated tests use a mocked `MatchProvider`, mocked analysis responses in the browser, and local PGlite/Supabase/storage test adapters. They cover valid results, unknown eligibility, missing resumes/descriptions, unreadable sources, unsupported documents, invalid output, quota errors, authentication/origin/request limits, ownership, cached results, content changes, rate limits, concurrent leases, and lease recovery. The production browser route also exercises actual saved-PDF extraction and reports missing Gemini configuration without making a live call. No automated test should send a real resume or use a live Gemini key; Playwright explicitly supplies an empty key.

Run `npm run lint`, `npx tsc --noEmit`, `npm test`, and `npm run build`. Run matching/import browser coverage with `npx playwright test tests/e2e/ai-match.spec.ts tests/e2e/import-flow.spec.ts --project=desktop --project=webkit-iphone`.

Validation passed: lint, TypeScript, 46 unit/database tests, and 32 matching/import/design browser tests across desktop Chromium and iPhone WebKit, including accessibility checks. The browser suite builds and runs the production app.

Live Gemini inference and live Supabase persistence were not verified during implementation. Local database, mocked inference, and browser results are not evidence of a successful live API call or deployed migration.

## Environment and deployment

1. Apply migration 005 once in the existing Supabase project after migrations 002–004. It creates new tables/functions and reloads the PostgREST schema cache. Keep all existing policies and auth configuration.
2. Retain `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the existing canonical `NEXT_PUBLIC_SITE_URL`. Add `GEMINI_API_KEY` as a server-side secret in the hosting environment (and `.env.local` for local development). Do not commit it or print it in logs. The model is pinned in code; no new public variable is needed.
3. Run the validation commands above and deploy the existing Next.js app through its normal workflow. No Capacitor configuration, plugin, native OAuth, or IPA change is required. Redeploy/restart after changing server environment variables.
4. For live verification, sign into a dedicated test account and upload a short synthetic selectable-text PDF with explicitly stated skills and experience. Add a detailed synthetic job and bookmark it. Analyze, confirm a persisted timestamp/score and Unknown checks for unstated eligibility, then close/reopen the details and verify the saved result. Inspect the owner-scoped database row and token metadata.
5. Analyze again through **Analyze Match** with unchanged inputs and verify the cached indicator and unchanged analysis timestamp. Use **Analyze Again** to explicitly request new inference. Edit the description or upload a new resume version and verify a new content hash/snapshot. Check that missing text and vague descriptions produce errors without scores.
6. Test with a second account: the first account's resume/analysis IDs must be unavailable, even when the job is shared. Verify concurrent requests return 409 and the quota returns 429 after ten requests per window. Never share real tokens or document content in bug reports. Remove synthetic test documents/jobs afterward; their analyses cascade with them.
7. Verify the panel in desktop web and iPhone Safari. The UI uses ordinary fetch/select/buttons without new webview dependencies; confirm it against the deployed web origin in the existing Capacitor WKWebView when a device is available. Desktop/iPhone WebKit tests do not constitute physical-device or native-shell verification.
