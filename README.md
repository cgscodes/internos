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

## Capacitor iOS Google OAuth

### Findings and architecture

The original iOS shell had only Capacitor Core/iOS installed, no App/Browser plugins, and no `CFBundleURLTypes` registration. The login button always used the ordinary HTTPS web callback and had an unbounded pending state. `SceneDelegate` already forwarded UIScene URLs to Capacitor, but no JavaScript callback listener could consume them. The bundled fallback page also only said “Loading InternOS”. These are verified repository findings. No real Google authorization exchange was observed during implementation, so a particular live PKCE error or middleware redirect loop was **not** confirmed.

Safari/system-browser and WKWebView sessions must not be assumed to share cookies. The native flow now starts PKCE **through a same-origin HTTP request from the hosted WebView**, opens Google through Capacitor Browser (`SFSafariViewController`), receives a **code-only** custom-scheme callback through Capacitor App, and sends the code back in a same-origin POST from the WebView. Next.js exchanges it using the original WebView's verifier cookie and establishes the normal Supabase cookies in that HTTP response. A separate verified-user read checks that the app retained those cookies before navigating. Safari cookies are never copied; access/refresh tokens never cross the native bridge or appear in the callback response.

The remote `server.url` architecture is retained for this targeted fix. It can support this handoff because the hosted page is the WebView's first-party HTTPS origin, and the Capacitor bridge can deliver the callback back to that page. Capacitor documents `server.url` as a live-reload facility rather than a production deployment recommendation; this fix does not certify App Store review eligibility or the broader remote-code architecture. Do not replace it with a bundled `capacitor://localhost` frontend and expect these cookies to work unchanged: that would require a separate first-party/backend authentication design because it changes the request origin and cookie context. See the official [Capacitor configuration](https://capacitorjs.com/docs/config), [Browser API](https://capacitorjs.com/docs/apis/browser), and [App deep-link API](https://capacitorjs.com/docs/apis/app).

### Files and safeguards

- `src/lib/auth/native-contract.ts`: the sole allowed callback is `com.internos.mobile://auth/callback`. It accepts one nonce and one authorization code or OAuth error. Unknown destinations, duplicate parameters, token fragments, and callback-supplied `next` values are rejected.
- `src/app/auth/native/start/route.ts`: same-origin start/cancel endpoints. The server chooses a random nonce, stores the validated destination in a host-only HttpOnly cookie, and generates PKCE with the existing Supabase SSR client. The native verifier is HttpOnly and expires with the three-minute attempt. This endpoint returns an authorization URL, not a session.
- `src/app/auth/native/callback/route.ts`: same-origin POST checks the nonce/expiry, exchanges the one-use PKCE code, verifies `getUser()`, clears the attempt, and returns only a safe local destination. A mismatched nonce cannot consume the real attempt. `session/route.ts` verifies server recognition after cookie writes. Existing web `/auth/callback` behavior is retained.
- `src/lib/auth/native-oauth.ts` and the existing sign-in button: native iOS detection, listeners installed before opening Browser, warm/cold launch recovery, duplicate callback suppression, lifecycle cleanup, browser dismissal, cancellation, and retry errors. Requests/plugin operations are bounded to 15 seconds and the native browser wait to three minutes. Ordinary web loading has a 30-second retry bound. Only a completed flow's nonce is cached; codes/tokens are not stored by this controller.
- `ios-shell/capacitor.config.ts`, Info.plist and app delegates: registered scheme, App/Browser plugins, UIKit/UIScene forwarding, reuse of the existing storyboard bridge, and disabled bridge URL logging. Native HTTP/cookie monkey-patching is disabled so same-origin `fetch` uses WKWebView's own normal cookie store. External provider hosts are not added to WebView navigation permissions.
- `ios-shell/www/index.html`: a connection failure page and bounded retry replace the endless bundled loading message. `server.errorPath` points to this fallback.

Existing Supabase RLS policies, migrations, dashboard design, public-key configuration, and verified-user authorization are unchanged. The existing SSR session-cookie policy is preserved; making the native PKCE verifier HttpOnly does not change the browser session client into an HttpOnly-token architecture.

### Deployment and native setup required

1. Deploy the updated Next.js source to **https://internos-green.vercel.app** before testing the updated iOS binary. Its native endpoints must be available there; rebuilding only the Xcode app does not update hosted JavaScript or server routes. Set `NEXT_PUBLIC_SITE_URL=https://internos-green.vercel.app` alongside the existing public Supabase variables. No new secret, migration, or service-role credential is needed.
2. In Supabase Authentication → URL Configuration, keep the existing HTTPS web callback allowlist entry and add this native redirect pattern, which allows the per-attempt nonce query:
   ```text
   com.internos.mobile://auth/callback?state=*
   ```
   The server always generates the exact fixed native path, and the app separately rejects any other path or extra redirect parameter. Follow Supabase's [redirect matching rules](https://supabase.com/docs/guides/auth/redirect-urls). If Supabase sends the user to the Site URL instead of the custom scheme, confirm the native allowlist matches the `redirect_to` value; do not add a catch-all HTTPS redirect.
3. Google Cloud's OAuth **web client** redirect remains your **Supabase HTTPS** `/auth/v1/callback`, not the app's custom scheme. Keep Google enabled in Supabase. Google consent must happen in the system browser, not an embedded Google WKWebView login.
4. Install both the web and native dependencies, sync the shell, then open the existing Xcode project:
   ```sh
   npm ci
   npm --prefix ios-shell ci
   npm --prefix ios-shell run sync
   npm --prefix ios-shell run open
   ```
   `ios-shell/capacitor.config.ts` is the canonical spelling. The App/Browser native packages are registered by `cap sync`; its generated native config/bridge assets are intentionally ignored by Git and recreated by sync.
5. In Xcode, build/run scheme **App**. The bundle ID and scheme are `com.internos.mobile`. Configure your own signing team for physical-device installs; simulator builds do not require a signing identity. Do not enable nonpersistent WebView data storage, widen navigation to Google hosts, copy Safari cookies, or add token-injection scripts.

### Verification checklist

| Scenario             | Verification                                                                                                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop web          | Open the deployed site in a fresh browser. Sign in with Google, reload, inspect a protected page, sign out. The ordinary HTTPS callback must still be used.                                                                                                                                 |
| iPhone Safari        | Repeat directly in Safari, outside the shell. Native plugins must not activate.                                                                                                                                                                                                             |
| Capacitor simulator  | Start from the app's login screen. Select Continue with Google, complete consent in the system sheet, and confirm the sheet dismisses and the requested dashboard opens **inside the app**.                                                                                                 |
| App restart          | After success, terminate/reopen the app; protected pages should recognize the persisted WebView session. Also try terminating during consent and returning within three minutes: the cold-launch handler should recover it, or show a retry error if the process lost its cookies.          |
| Sign-out             | Sign out inside Settings, then reopen a protected page and restart the app. Both should require login. Safari's independent login must not be copied back.                                                                                                                                  |
| Cancellation         | Use the system sheet's Done/Cancel action or the app's Cancel sign-in action. Loading must stop, the pending verifier/nonce must be cleared, and a new attempt must work.                                                                                                                   |
| Timeout/network loss | Leave consent unfinished past three minutes, or disable networking during completion. An actionable retry error must replace loading. Restore networking and start a fresh attempt.                                                                                                         |
| Expired session      | Expire/revoke the Supabase test session. Refresh/reopen a protected page; authorization must fail closed, and native reauthentication should work.                                                                                                                                          |
| Invalid callback     | Open `com.internos.mobile://auth/callback?state=invalid&code=test-only` with the simulator's URL opener. It must never authenticate. Wrong hosts/paths, nonce mismatch, duplicate callbacks and token fragments must fail safely. Never paste a real callback/code into a command or a log. |
| Protected routes     | With no app session, check all five dashboard paths and direct APIs; existing redirects/401 responses must remain.                                                                                                                                                                          |

For a simulator compile check without signing:

```sh
xcodebuild -project ios-shell/ios/App/App.xcodeproj -scheme App \
  -sdk iphonesimulator -configuration Debug \
  -derivedDataPath /tmp/internos-ios-build CODE_SIGNING_ALLOWED=NO build
```

Automated tests use simulated Capacitor plugin events and a simulated OAuth provider with genuinely separate system-browser/WebView cookie jars. They cover warm/cold return, normal server session establishment, no-token response bodies, persistence across reload, sign-out/protection, cancellation, bounded timeout, invalid/replayed callbacks, nonce mismatch, expired attempts, and missing PKCE. They do **not** run real Google consent or prove Safari/physical-device behavior. Web tests retain the existing desktop/iPhone viewport coverage; the iPhone viewport project uses Chromium, not actual iPhone Safari.

The iOS simulator build and plugin registration were verified locally. No simulator was booted during the initial inspection; a live simulator/physical-device Google login still requires deploying these web changes, updating the Supabase allowlist, and completing the checklist interactively. Custom URL schemes are not exclusive to one installed app; PKCE prevents an interceptor from redeeming the code, but claimed HTTPS universal links provide stronger routing guarantees for a later public release. Universal links require an Apple Team ID, Associated Domains entitlement, and an `apple-app-site-association` file and are not silently enabled here.
