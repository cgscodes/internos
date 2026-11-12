# InternOS

A mobile-first internship workspace built with Next.js App Router, strict TypeScript, Tailwind CSS, shadcn-style components, Radix Dialog, Lucide, and Supabase. Vercel-compatible; no Firebase or service-role key.

## Start the existing application

Requires Node.js 22.13+ and npm. Keep your existing `.env.local` intact.

```sh
npm ci
npm run dev
```

Open http://localhost:3000/login. Every dashboard route requires authentication, including when Supabase configuration is absent. There is no automatic demo bypass. Phase 2 also requires the incremental migration described below before dashboard data can load. Synthetic fixtures exist only in isolated tests.

## Google OAuth configuration

The initial migration has **already been applied** to the existing Supabase project. Do not reapply the initial SQL, recreate tables, reset the database, or seed production. Apply only the new Phase 2 migration described below.

1. Keep the project's URL and **publishable** key in `.env.local`. A legacy `anon` key is also supported. Never put a secret key or service-role JWT into any `NEXT_PUBLIC_` variable.
   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```
   `NEXT_PUBLIC_SITE_URL` is the recommended canonical app origin, especially behind a reverse proxy. Set it to the exact HTTPS origin in production, with no path. If empty, redirects use the request origin. Keep the hostname consistent throughout sign-in: `localhost` and `127.0.0.1` have separate cookies. Restart the app after changing these variables; rebuild on deployment because public values are included at build time.
2. In Google Cloud Console, create/configure an OAuth **Web application** client and the consent screen. Add `https://YOUR_PROJECT.supabase.co/auth/v1/callback` as its authorized redirect URI. Use the callback URI shown in your Supabase dashboard if using a custom auth domain. If consent is in testing mode, add the Google accounts you intend to use as test users.
3. In Supabase Authentication → Sign In / Providers → Google, enable Google and enter the Google client ID and client secret there. Those credentials stay in Supabase, never in browser environment variables.
4. In Supabase Authentication → URL Configuration, set the Site URL to `http://localhost:3000`. Add `http://localhost:3000/auth/callback` to the redirect allowlist. For production, set the Site URL and allowlist to your exact HTTPS origin and `/auth/callback`; avoid broad wildcard allowlists.
5. Restart `npm run dev`, open `/login`, and choose **Continue with Google**. Google returns through Supabase, then the app's `/auth/callback` exchanges the PKCE authorization code for cookie-backed session credentials. Missing/rejected codes or provider cancellation return a fixed retry message.

See the official [Supabase Google OAuth guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) and [Next.js SSR client guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs) for provider setup.

## Session and authorization behavior

- `src/lib/supabase/browser.ts` creates the browser PKCE client. The browser does not exchange authorization codes; the server callback owns that step.
- `src/lib/supabase/server.ts` creates a request-scoped server client using Next.js's asynchronous cookie API. `getUser()` verifies identity with Supabase; cookie-embedded user objects and `getSession()` are never used for authorization.
- `src/proxy.ts` refreshes sessions, forwards refreshed cookies into Server Components, and copies outgoing cookie changes onto redirects. Protected APIs return JSON `401`; protected pages redirect to `/login`, preserving a validated dashboard destination. The protected layout and server services verify identity again rather than relying exclusively on proxy checks.
- An authenticated visitor to `/login` returns to the dashboard. `next` only allows local dashboard paths, rejecting external URLs, protocol-relative/encoded bypasses, and auth redirect loops. Canonical redirects do not trust forwarded-host input.
- Cookies use host-only scope, `Path=/`, `SameSite=Lax`, and `Secure` for HTTPS (always for production server writes). Supabase SSR's browser client must read auth cookies for PKCE and automatic refresh, so those cookies intentionally are not `HttpOnly`; server authorization still requires verified identity. No refresh/access tokens are copied into application state or logs.
- Private responses and redirects use `Cache-Control: private, no-store`. Auth-route development access logging is suppressed to avoid logging authorization-code query strings. Configure production hosting/access logs to redact callback query strings as well.
- Sign-out is a same-origin POST and revokes the current session, clears its cookies, and performs a full redirect. Failures show a retry message. The browser listener handles session loss and sign-out from another tab with a full navigation to discard private cached pages. A `401` on workspace mutations also returns the user to sign-in.
- Server queries keep using the authenticated public client, user-ID filters, and existing RLS. Phase 2 adds private user-owned jobs alongside the read-only shared catalog through the incremental migration described below. No privileged key is used. A missing profile row has a display-only fallback to verified Google identity; authentication does not overwrite profiles, while an explicit profile save can create a missing own profile row.
- Name/email/photo come from the verified user and existing profile. Photos fall back to initials on missing/failed images. Google metadata is used for display only, never permissions.

## Verification commands

```sh
npm run lint
npm run typecheck
npm test
npx playwright install chromium  # once
npm run test:e2e
npm run build
npm start
```

Browser tests build and launch their own production app on `127.0.0.1:3100` and a local service on `127.0.0.1:54329` with simulated Supabase Auth and a PostgreSQL-backed PostgREST adapter. Both services bind locally, use fabricated identities, and are stopped after testing. Their explicit environment overrides leave `.env.local` and the real Supabase project untouched. Tests exercise the actual browser/server SDKs, PKCE code verifier exchange, cookies, redirects, sign-out, expired/forged sessions, and existing application flows on desktop and iPhone viewports. They do **not** verify Google's provider configuration or live Supabase behavior. SQL tests run only against an isolated in-memory PGlite database.

## Manual test against your configured Supabase project

1. In a fresh private browser window, open each of `/`, `/discover`, `/applications`, `/resumes`, and `/settings`. Confirm that each returns to `/login`, with the destination preserved.
2. From a protected page's login screen, click Continue with Google and finish consent. Confirm you return to that page, see your actual name/email/photo (or initials), and cannot open `/login` while authenticated. Reload and open another tab to confirm session persistence.
3. Leave the app open past your Supabase access-token lifetime, then refresh. With a valid refresh token, it should remain signed in. Revoke that session from trusted Supabase administration and reload: access should fail closed and return to login. Removing the session cookies also must return to login.
4. In Settings, select Sign out. Confirm the login screen appears and all five dashboard paths are protected again. Check an already-open tab also leaves the private workspace. The current browser session is signed out; other independently signed-in devices are unaffected.
5. Cancel Google consent and visit `/auth/callback` without a code or with a used/invalid code. Confirm a retry message with no raw provider details. Try `/login?next=https://example.com` and `/auth/callback?next=//example.com`: neither may redirect externally.
6. With two test accounts, create separate application notes/documents. Confirm each account sees only its own data. This is the live RLS smoke test; do not disable policies to make it pass.

## Implemented

- Overview metrics derived from workspace data; actionable next steps and event history.
- Searchable opportunity catalog, details, save action, manual entries, validated external links. No fabricated match scores.
- Nine-stage application tracker; desktop Kanban, mobile grouped list, company/role/status filtering, creation, details, notes, deadlines, important dates, status updates, confirmed deletion.
- Master resume upload, versions and version metadata, PDF/DOCX validation (5 MB), private storage, ownership checks, and 60-second signed download URLs.
- Profile, education, skills, career interests, locations, security status, sign-out, and JSON export. Downloads of resume bytes remain separate from JSON export.
- Server-side Google OAuth PKCE callback, cookie refresh proxy, verified users at protected layout and API boundaries, origin checks on mutations, Zod validation, RLS on every table, and no service-role credential.
- Accessible Radix dialogs with focus management, labeled forms, keyboard controls, loading/error/empty states, reduced-motion support, iPhone safe-area navigation.

## Structure

- `src/app/(workspace)`: five protected pages and layout.
- `src/app/auth`: OAuth initiation, callback, sign-out.
- `src/app/api`: authenticated mutations, resume access, data export.
- `src/components`: application shell, shared workspace state, application editor, UI primitives.
- `src/lib`: schemas/types, validation/business logic, server Supabase client, data services.
- `supabase`: schema migration, local seed, local configuration.
- `tests`: validation, PostgreSQL RLS/trigger checks, browser flows.

## Deployment

Import this repository into Vercel, use the Next.js preset, and set both Supabase variables in project environment settings. Configure the production Google/Supabase redirect URLs and canonical app origin before signing in. The existing database migration is already applied; do not rerun it for this auth update. Build: `npm run build`; start: `npm start`. No hosting account or production database is provisioned by this repository.

## Deferred

AI matching, OpenAI requests, resume parsing/tailoring, live job ingestion, automated recommendations, drag-and-drop Kanban, calendar/email integrations, interview-specific scheduling UI, account deletion, multi-factor enrollment UI, and document deletion are deferred. The interviews table is a scheduling foundation; applications use pipeline status and important dates, while user_jobs stores active bookmarks. AI is not presented as active. `OPENAI_API_KEY` is reserved and unused.

Live Google OAuth, Supabase Storage behavior, and deployed multi-user flows require configured infrastructure and must be smoke-tested there before public release. Automated local database tests verify the migration, ownership isolation, cross-owner foreign keys, and event/version triggers in PostgreSQL via PGlite; they do not substitute for a hosted Supabase integration test.

The production build uses webpack with Tailwind's standard PostCSS integration; development uses Turbopack. Geist fonts are bundled locally, so builds do not fetch Google Fonts.

Dependency audit: the installed ESLint TypeScript parser chain reports seven moderate development-only advisories from `minimatch`. The compatible `npm audit fix` currently leaves them unresolved; recheck upstream before public release. No production dependency advisory was reported in the full audit.

## Phase 2: application tracking

The deployed initial SQL supplied for Phase 2 matches `supabase/migrations/202611110001_initial.sql`. That file has not been changed. The app now requires the incremental [002_application_tracking.sql](supabase/migrations/002_application_tracking.sql). Do not reapply the initial migration or run `seed.sql` against production.

### Apply the new migration manually

1. Confirm that the project's existing tables match the supplied initial SQL. Back up the project using your normal Supabase workflow.
2. In the **existing project's SQL Editor**, run **only** `supabase/migrations/002_application_tracking.sql`, once. It runs in a transaction, adds columns/policies/indexes and transaction functions, and leaves existing records in place. It does not create sample postings or recreate tables. The repository's original migration has a timestamp filename while the requested new migration is named `002_...`; do not rely on a fresh CLI reset to order these files. Local automated tests apply the initial file first, then `002` explicitly.
3. If the migration reports a uniqueness violation, it has rolled back. Inspect pre-existing non-null `(user_id, job_id)` duplicates and resolve them deliberately before retrying; no records are silently deleted. Existing unlinked legacy applications are retained. Their matching active company/role/location/URL combinations are checked by the creation transaction, but terminal legacy rows are not retrospectively assigned a job or application attempt.
4. The migration notifies PostgREST to reload its schema. If the API still reports a missing function, run `NOTIFY pgrst, 'reload schema';` in the SQL Editor, then reload the app.
5. Keep the existing public Supabase configuration and Google OAuth settings. No new secret or service-role key is required. Restart `npm run dev` or redeploy after applying the migration.

The read-only REST schema inspection attempted during development returned HTTP 401. The supplied SQL was therefore used to confirm the deployed baseline; no production migration or write test was performed by the implementation session.

### Data model and behavior

- Existing jobs/companies have `created_by = NULL` and remain the shared read-only catalog. New user-created jobs/companies are private; only their creator can edit them. Reference-check triggers reject links to another user's private company/job, including direct PostgREST requests.
- `user_jobs` is now the actual bookmark relationship. Bookmarking does **not** create an application. Discover supports manual jobs, authorized edits, search/type/bookmark filters, original links, and starting an application from a job's details.
- Application create/update use `SECURITY INVOKER` PostgreSQL functions so company resolution, private job creation, the application, and its bookmark commit together or roll back together under the signed-in user's RLS. There are no service-role CRUD calls. Server services validate inputs with Zod and never accept a user ID as authority.
- Linked applications have a job and company relationship; editable application fields remain private snapshots, so editing an application does not rewrite a shared posting. Existing legacy snapshots remain editable.
- One active application per user/job is enforced by a partial unique index. Reapplication is allowed only after all previous attempts for that job are Rejected or Withdrawn; it creates a new numbered attempt and retains the old history. Offer remains an active outcome for duplicate prevention. Private job identity uses company, normalized role/location, and original URL; genuinely different postings/locations/URLs can be separate jobs.
- Applied, Assessment, Interview, Offer, Rejected, and Withdrawn count as submitted. Saved, Preparing, and Ready never do. Entering a submitted stage defaults an empty applied date to the database's current date. Existing historical dates are not invented or backfilled. Users can record an explicit applied date.
- Dashboard metrics come from the authenticated account's PostgreSQL application records. Reads paginate through the API to avoid the default row limit truncating counts/history. Upcoming deadlines exclude Offer/Rejected/Withdrawn and show dates today or later. Empty accounts show zero counts and useful empty states.
- Database triggers record creations, status transitions (with from/to states), and details updates. Notes are not copied into event descriptions or logs. Deletion cascades the deleted application's history. The UI has a separate accessible confirmation dialog.
- Mutations are intentionally **not optimistic**. Status selectors and forms wait for a successful database mutation and refreshed server snapshot. Failures retain the last known state and offer a reload action. A save followed by a failed refresh warns that the change may already have committed, avoiding blind retries.

### Changed areas

- `src/lib/database.types.ts`, `src/lib/validation/tracking.ts`, `src/lib/business/tracking.ts`: database rows, mutation validation, submitted-stage/count logic, and draft helpers.
- `src/lib/services/tracking.ts`, `workspace.ts`, `errors.ts`, `src/app/api/workspace/route.ts`: authenticated transactional writes, scoped reads, pagination, and sanitized errors.
- `src/components/workspace-provider.tsx`, `application-dialog.tsx`, `job-dialog.tsx`, `shared.tsx`: real mutation flows, application history/confirmation, company selection, job editing, bookmarks, and visible errors. The old runtime demo module/local application storage has been removed.
- Overview, Applications, Discover and the existing stylesheet: real counts/deadlines, pipeline selectors, and jobs/bookmarks, retaining the original shell, typography, and responsive styling.
- SQL migration and tests: transaction/RLS coverage, business validation, production-browser flows, and opt-in live verification. The authenticated Supabase clients now use the database types.

### Verify real persistence

After applying `002` and signing in to your own Supabase-backed app:

1. Create an application with a company, role, description, URL, deadline, applied date, and notes. Reload, close/reopen the browser tab, and sign out/in. The record and all fields must remain.
2. In the Supabase Table Editor, verify that `applications.user_id` is your Auth user ID and `job_id`/`company_id` link to the expected rows. Do not disable RLS. Confirm the actual stored dates and notes.
3. Change its status on the board. Reload and inspect its detail history and `application_events`; confirm exactly one status event per successful change. Verify submitted/interview/offer counts, including that Saved/Preparing/Ready are not submitted.
4. Try creating the same active application again. It should report a duplicate. Mark the first Rejected/Withdrawn and explicitly reapply from the job details; the new application should have the next attempt number.
5. Create/edit a private job in Discover, bookmark/unbookmark it, filter bookmarks, and start an application. Shared job details must not offer editing. Use a second Google test account to verify that private jobs, applications, notes, and history cannot be read or changed across users.
6. Delete an application, cancel once to confirm it remains, then confirm deletion. Reload and verify the application/history are gone. Its job/bookmark remain independent library records.

An optional **live, real Supabase** command is also included. In a gitignored `.env.persistence-test.local`, set `INTERNOS_PERSISTENCE_TEST_TOKEN` to a current access JWT from your signed-in **test account**, locally. Optionally set `INTERNOS_OTHER_USER_TEST_TOKEN` for a second distinct test account. Do not commit or share these tokens. The script verifies the identities through Supabase, creates synthetic private records, reads from a fresh client, updates status/history, rejects a duplicate, optionally checks another user's permissions, and cleans up its temporary records:

```sh
npm run test:live
```

Exit code 2 means required credentials were missing and the live test did not run. An expired JWT also prevents verification. This command writes temporary synthetic test data to the configured project; use a dedicated test account and inspect any cleanup warning.

### Automated tests and limits

`npm test` applies both migrations to isolated PGlite databases and checks real PostgreSQL functions, RLS, ownership boundaries, history, rollback, duplicates/reapplication, empty counts, and validation. `npm run test:e2e` builds and runs the production Next.js app on port 3100, with simulated OAuth and a local PostgREST-compatible adapter backed by **the same real PGlite schema/functions/policies**, rather than JavaScript record mocks. It covers existing auth flows plus application/job CRUD, refresh persistence, bookmarks, counts, status failure handling, direct API isolation, and desktop/iPhone layouts. Test fixtures are inserted only into the isolated local database.

These tests do not certify the deployed Supabase instance, its gateway configuration, or provider setup. Production persistence is **unverified until the live checklist or `test:live` succeeds**. No AI integration or scraping is included. Drag-and-drop, realtime subscriptions across devices, and server-side paginated catalog browsing are deferred; the current workspace refreshes snapshots after mutations and loads the visible catalog/history in batches. Browser tests temporarily build with test public environment values, so run a final `npm run build` with your real environment before deployment.
