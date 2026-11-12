# PDF job import and Application Flow

Phase 3.5 adds two focused features to the existing Discover and Overview pages. Authentication, OAuth/native callbacks, Capacitor plugins, database migrations, and unrelated page layouts are unchanged. No IPA or deployment was performed in this phase.

## PDF library and workflow

Uses Mozilla **PDF.js (`pdfjs-dist` 6.5.438, Apache-2.0)**, with its version-matched legacy module worker. This maintained library supports browsers and Node; the focused extraction tests also run in Node.

**Production extraction deliberately happens on the user's device, not in a server function.** Vercel Functions have a [4.5 MB request limit](https://vercel.com/docs/functions/limitations), which prevents a direct 10 MB server upload. Local extraction meets the file limit without introducing a staging bucket, retention jobs, service-role credentials, or another backend. The PDF never leaves the device. Reviewed text/fields are saved through the existing authenticated server endpoint and job transaction; browser validation is not used as a database authorization boundary.

1. Discover → **Import PDF**. The existing protected page and a fresh authenticated `/api/workspace` request verify the session before processing.
2. Select a PDF up to **10 MiB (10 × 1024 × 1024 bytes)**. Actual PDF header and parser validation apply independently of filename/MIME. No PDF is stored in Supabase or uploaded to Vercel.
3. A dedicated PDF.js worker extracts selectable text only. Limits: **40 pages**, **19,000 text characters**, **15 seconds of parsing**, **30 seconds for the overall import**. Cancel terminates the parser worker. Text is rejected rather than silently truncated when limits are exceeded.
4. Review company, job title, location, supported employment type, deadline, salary, source URL, and full extracted description. Every extracted field is marked for checking; missing/ambiguous fields are marked for manual entry. Company/title/type are required by the existing schema. Numeric ambiguous dates are left blank.
5. **Save job** uses the existing `/api/workspace` `job.create` action and `save_tracking_job` transaction, with server-side identity verification, Zod validation, RLS and existing duplicate matching. A duplicate reuses the canonical existing job and explicitly reports that its details were kept; it does not silently overwrite it.
6. **Save & start application** opens the existing application editor with **Saved** status and the persisted canonical job ID. An existing active application is opened when available. Nothing is automatically marked Applied. The application is saved only through the existing editor/service.

The schema has no salary column. The reviewed salary is prepended as `Salary (reviewed): …` to the unchanged extracted description. The original extracted salary/text remain available for reference. A reused duplicate retains its existing description; edit that record through Discover to change it.

## PDF security and limits

The parser receives only in-memory bytes, never an input URL or filesystem path. PDF.js external binary resource loading is replaced with a rejecting factory; worker fetch, WebAssembly/image decoding, font faces and system font loading are disabled. No rendering, document actions, scripting APIs, attachments, annotations, XFA, OCR, AI or scraping are invoked. Embedded URLs remain text until the user explicitly chooses a validated original-posting link. Raw parser errors are replaced with fixed actionable messages; private document contents are not logged.

Password-protected PDFs fail safely. Encryption permissions are checked after opening as well, rejecting encrypted PDFs with an empty opening password. Corrupt, unsupported and image-only documents receive an explanatory retry message. Empty/failed imports do not create records. Session expiry redirects to login; saves remain subject to the existing server authorization and origin checks.

Extraction is heuristic, not semantic AI. Unlabelled/multi-column exports, unusual fonts, languages, and partially scanned documents may need substantial manual correction. Only selectable text can be preserved; visual layout and image text are not reconstructed. Jobs support the existing Internship/Co-op/Graduate enum; other employment types require manual review and remain in the source description. A browser worker has time/page/text/input limits but no portable hard heap quota: pathological PDFs can still stress the user's browser. Node compatibility is tested, but the Node helper is not exposed as a server parsing endpoint or advertised as an OS sandbox.

## Sankey model

Uses **d3-sankey** and the authenticated workspace's existing `application_events.from_status` / `to_status` columns. The existing service already loads these events through the authenticated Supabase client with user scoping and RLS; no new query or database access path was introduced.

- Only events containing two valid, distinct existing statuses count. Creation events, ordinary edits, missing structured history and same-status entries do not become transitions.
- Event IDs are deduplicated; every distinct recorded change counts once. Repeated moves count repeatedly, not once per application.
- Aggregate by `(from_status, to_status)`; ribbon width equals event count. Tooltip percentages show both share of all recorded changes and share of outgoing changes from that status. The accessible table shows counts and share of all recorded changes.
- The chart is a **bipartite before/after summary**: each status has separate source and destination nodes. This documented fallback handles reversals and cycles without dropping events, inventing timestamps, or implying a conversion funnel. It does not reconstruct per-application paths or sequences.
- All nine existing statuses are supported. Current application statuses and legacy event descriptions are never used to guess past transitions. Missing structured history is explained in the section; an empty account has a useful empty state.
- Counts are events in retained history, not unique applications. Deleted applications lose their events through the existing cascade; no historical audit archive is introduced here.

The solid panel uses existing tokens. SVG width follows its container, chart height follows the number of statuses, and a semantic table provides the same information on touch devices and to assistive technology. No chart animations or heavy visual effects were added. SVG native hover titles are supplementary; the table is the reliable touch/keyboard alternative.

## Files changed

- `src/components/pdf-job-import.tsx`: upload, session check, review, bounded processing/saving, existing API integration and canonical duplicate reuse.
- `src/lib/pdf/extract.ts`, `src/lib/pdf/job-fields.ts`: data-only extraction, limits, validation and field heuristics.
- `scripts/copy-pdf-worker.mjs`, `package.json`, `package-lock.json`: parser/chart dependencies and prebuild/predev worker asset generation.
- `src/components/application-flow.tsx`, `src/lib/business/application-flow.ts`: responsive Sankey/table and pure transition aggregation.
- `src/app/(workspace)/discover/page.tsx`, `src/app/(workspace)/page.tsx`: two localized feature insertion points.
- `src/app/globals.css`: scoped review/chart/table styles using existing tokens.
- `tests/pdf-import.test.ts`, `tests/application-flow.test.ts`, `tests/e2e/import-flow.spec.ts`, `tests/helpers/job-pdf.mjs`, `tests/fixtures/encrypted*.pdf`: focused parser, aggregation, persistence and browser checks. Encrypted fixtures contain synthetic data and were generated using macOS PDFKit without adding a dependency.
- `playwright.config.ts`: includes the new feature checks in existing WebKit projects.
- `eslint.config.mjs`, `.gitignore`: excludes the generated third-party worker and prior iOS build artifacts from source checks/tracking. No native project configuration was changed.
- `docs/pdf-import-and-flow.md`: workflow, verification, limitations and deployment notes.

The previously uncommitted IPA-build receipt and iOS build-output ignore entries were preserved. No changes to `001_initial_schema.sql`, `002_application_tracking.sql`, or any other migration were needed.

## Verification

```sh
npm run lint
npx tsc --noEmit
npm test
npm run test:e2e
npm run build
```

Final local results: lint, exact TypeScript check, and production build passed; **22 unit/database tests** and **64 browser tests** passed. Browser projects cover desktop/iPhone Chromium and desktop/iPhone WebKit. No live Supabase write test or physical-device test was performed.

Focused tests cover selectable-text extraction, missing fields, content signatures, exact/oversized limits, corrupt/image-only/encrypted PDFs, page/text limits, cancellation, inert URLs, real 10 MiB browser extraction, editable review, duplicate reuse, Saved applications, session failures, aggregation/reversals/percentages, absent history and responsive charts. Existing tests cover direct API authorization, multi-user isolation, job/application CRUD, RLS, OAuth/native handoff and accessibility.

Browser tests use simulated OAuth and an isolated PostgreSQL/PGlite adapter, with synthetic PDFs and records. They exercise the real job services/SQL and real browser PDF worker; they do not establish live Google, hosted Supabase persistence, actual Handshake/LinkedIn export compatibility, physical WKWebView performance or iOS file-picker behavior. Test those with your own account/documents before release. No native build/export was run for this task.

## Deployment

1. Review and commit the feature files alongside any intended existing local changes. This task did not deploy.
2. Use the existing project's Node **22.13+** environment, `npm ci`, then the checks above. `npm run build` automatically copies the version-matched PDF.js worker into `public/`; keep the `prebuild` hook. Do not hand-copy a worker from another PDF.js version.
3. Deploy the existing Next.js project through its normal Vercel workflow after approval. No new environment variables, buckets or SQL migrations are required. The existing Phase 2 migration must already be applied for structured history/job descriptions.
4. Verify the generated `/pdf.worker-6.5.438.min.mjs` asset returns JavaScript over the same origin. If you maintain a separate CSP, permit same-origin module workers (`worker-src 'self'`); do not add `unsafe-eval` or broad external worker permissions for this feature.
5. Test a small and a 10 MB selectable-text export, correct missing fields, save, reload Discover, import it again and confirm reuse, then start a Saved application. Make several status changes and verify chart/table counts against actual history. Repeat with another user to confirm isolation.
6. Repeat on iPhone Safari and the existing Capacitor shell after the web deployment. Test cancel, invalid/encrypted/scanned PDFs, expired sessions and mobile review scrolling. No Capacitor plugin or IPA rebuild is required for these hosted web changes.
