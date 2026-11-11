# InternOS

A mobile-first internship workspace built with Next.js App Router, strict TypeScript, Tailwind CSS, shadcn-style components, Radix Dialog, Lucide, and Supabase. Vercel-compatible; no Firebase or service-role key.

## Run the demo

Requires Node.js 22.13+ and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. With both Supabase environment variables empty, the app runs a **clearly labeled local demo**. Sample opportunities are not live listings. Demo applications and profile changes persist in this browser's `localStorage`; uploads are unavailable. Clear the `internos-demo-v1` storage key to reset. Production account data always uses PostgreSQL, never browser storage.

## Connect a Supabase project

1. Create a Supabase project. Copy its project URL and **publishable** key (not secret/service-role) into `.env.local`:
   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   ```
2. Apply `supabase/migrations/202611110001_initial.sql` using the project's SQL editor. For CLI-managed projects, install the Supabase CLI, then run `supabase login`, `supabase link --project-ref YOUR_PROJECT_REF`, and `supabase db push`. **Do not apply `seed.sql` to production.**
3. In Google Cloud Console, configure an OAuth web client and consent screen. Add `https://YOUR_PROJECT.supabase.co/auth/v1/callback` as an authorized Google redirect URI. Enable Google under Supabase Authentication → Providers and enter that client ID and secret there. Google secrets never belong in this app's public environment variables.
4. In Supabase Authentication → URL Configuration, set the Site URL to `http://localhost:3000`. Add `http://localhost:3000/auth/callback` to the redirect allowlist. For deployment, also add your exact HTTPS production origin and `/auth/callback` URL.
5. Restart `npm run dev`. Open `/login`, then choose Continue with Google. Configured workspaces require authentication; new accounts start empty.

The migration creates profiles on signup, nine public tables, private resume storage, owner policies, composite foreign keys preventing cross-user document/application associations, and database-generated application activity. Companies/jobs form an authenticated, read-only curated catalog; populate real listings through trusted database administration. Manual opportunity entry creates a tracked application.

## Local Supabase development

Install Docker and the Supabase CLI. Set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in your shell, then:

```sh
supabase start
supabase db reset
supabase status
```

Copy the local API URL and publishable/anon key reported by `supabase status` into the two app environment variables. Configure a separate Google OAuth client with the local Supabase callback `http://127.0.0.1:54321/auth/v1/callback`. `supabase db reset` applies migrations and the **local-only** sample catalog in `supabase/seed.sql`; it resets local data. Log in through Google to create your own local profile.

## Commands

```sh
npm run dev         # development server
npm run lint        # ESLint
npm run typecheck   # Next route types and strict TypeScript
npm test            # validation and database isolation tests
npm run test:e2e    # browser flows against a separately running local server
npm run build       # production build
npm start           # serve production build
```

For browser tests, run `npx playwright install chromium` once. Start the app in demo mode in another terminal, then run `npm run test:e2e`. Browser tests use isolated contexts and do not touch personal data.

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
- `src/lib`: schemas/types, demo data, server Supabase client, data services.
- `supabase`: schema migration, local seed, local configuration.
- `tests`: validation, PostgreSQL RLS/trigger checks, browser flows.

## Deployment

Import this repository into Vercel, use the Next.js preset, and set both Supabase variables in project environment settings. Configure the production Google/Supabase redirect URLs before signing in. Run the migration against the target database before releasing. Build: `npm run build`; start: `npm start`. No hosting account or production database is provisioned by this repository.

## Deferred

AI matching, OpenAI requests, resume parsing/tailoring, live job ingestion, automated recommendations, drag-and-drop Kanban, calendar/email integrations, interview-specific scheduling UI, account deletion, multi-factor enrollment UI, and document deletion are deferred. The interviews and user_jobs tables are foundations; the current UI uses application status/important dates and tracked Saved applications. AI is not presented as active. `OPENAI_API_KEY` is reserved and unused.

Live Google OAuth, Supabase Storage behavior, and deployed multi-user flows require configured infrastructure and must be smoke-tested there before public release. Automated local database tests verify the migration, ownership isolation, cross-owner foreign keys, and event/version triggers in PostgreSQL via PGlite; they do not substitute for a hosted Supabase integration test.

The production build uses webpack with Tailwind's standard PostCSS integration; development uses Turbopack. Geist fonts are bundled locally, so builds do not fetch Google Fonts.

Dependency audit: the installed ESLint TypeScript parser chain reports seven moderate development-only advisories from `minimatch`. The compatible `npm audit fix` currently leaves them unresolved; recheck upstream before public release. No production dependency advisory was reported in the full audit.
