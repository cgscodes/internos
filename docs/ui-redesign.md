# InternOS interface redesign

Implemented locally on November 12, 2026. No Vercel deployment, database migration, production write, IPA export, signing, or installation was performed.

## Reference and design decisions

Inspected [the requested reference](https://v0-dashboard-ui-alpha.vercel.app/) at desktop 1440×1000 and mobile 390×844 before implementation. It uses Geist typography, a warm framed canvas, segmented navigation, compact section headings, white rounded cards, green accents, and an asymmetric dashboard grid. Mobile stacks the cards. Its dashboard contains illustrative analytics and demo navigation; it does not expose substantive table, form, or dialog workflows to reuse.

A [public v0 template listing](https://v0.app/templates/uxbooster-modern-ux-analytics-dashboard-pHUEegzaKXu) was discoverable, but no reusable source repository with a clear license was identified. InternOS recreates the layout patterns in its existing components; no reference source, illustrations, data, or branding was copied. The requested desktop sidebar and mobile tab bar adapt that hierarchy to InternOS's five real destinations.

The in-app browser integration failed to initialize (`sandboxPolicy` metadata mismatch). Standalone Playwright provided the reference inspection, actual local rendering, screenshots, and Chromium/WebKit validation instead.

## Design system

`src/app/globals.css` owns palette, type, spacing, radii, surface elevations, borders, highlights, blur, shadow, motion, and responsive tokens. Geist fonts remain locally bundled; numerical metrics and dates use Geist Mono.

| Token                     | Light value / behavior                                                             |
| ------------------------- | ---------------------------------------------------------------------------------- |
| Canvas / primary text     | `#F7F8FA` / `#162B46`                                                              |
| Secondary text            | `#5E6E84`, adjusted from `#64748B` after contrast tests failed on pale backgrounds |
| Accent / success / border | `#3468A3` / `#25836B` / `#E5E9EF`                                                  |
| Glass / elevated glass    | White at .68 / .82 opacity                                                         |
| Blur                      | 16px navigation; 24px elevated overlays                                            |
| Spacing                   | 8px multiples; 4px optical details and compact badges                              |
| Radii                     | 8px details, 12px controls, 16px cards, 20px dialogs                               |
| Controls                  | 44px minimum height; mobile tab targets also exceed 44px width                     |
| Type                      | 12 / 14 / 16 / 20 / 24 / 28 / 32px; compact 10px secondary labels                  |
| Motion                    | 150 / 200 / 250ms; no continuous decorative animation                              |
| Responsive                | 48rem mobile, 64rem compact desktop, 90rem wide canvas                             |
| Dark surfaces             | Canvas `#101824`, solid `#192332`, adjusted light text and glass                   |

Solid cards, descriptions, notes, forms and documents retain stable backgrounds. Glass is reserved for the sidebar, toolbar, mobile tabs, filter bars, dialog headers, and small popovers. It is a CSS diffusion/highlight treatment, without shaders or an animation library.

Appearance supports Light, Dark, and System, with a Reduce transparency switch. Only these nonsensitive UI preferences use local storage; no session handoff or auth storage was changed. An early preference script avoids a light flash. CSS provides opaque defaults before `@supports`, standard and prefixed backdrop filters, reduced-transparency/motion preferences, increased contrast, and forced-color fallbacks.

## Components and files

| Files                                                                                       | Responsibility                                                                                  |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/components/design/glass.tsx`                                                           | GlassSurface, GlassNavigation, GlassToolbar, GlassButton, GlassTabBar                           |
| `src/components/design/glass-popover.tsx`                                                   | Radix GlassPopover: focus, Escape, collision bounds, closes on navigation                       |
| `src/components/ui/dialog.tsx`                                                              | Existing Modal / GlassDialog, opaque content with glass header, Safari opener focus restoration |
| `src/components/design/appearance.tsx`, `src/lib/appearance.ts`                             | Shared appearance controls, provider and early preference script                                |
| `src/components/design/workspace-menus.tsx`                                                 | Profile menu, settings/sign-out, actual recent-event notification control                       |
| `src/components/design/page.tsx`                                                            | PageHeader and real-data StatCard                                                               |
| `src/components/design/pipeline.tsx`                                                        | ApplicationCard, PipelineBoard, board/list selector                                             |
| `src/components/design/viewport.tsx`                                                        | Visual viewport dimensions and keyboard-aware mobile navigation                                 |
| `src/components/shell.tsx`                                                                  | Sidebar, floating toolbar, responsive tab bar, real application count                           |
| `src/app/layout.tsx`, `src/app/globals.css`                                                 | Providers, safe-area viewport, centralized design system and layouts                            |
| `src/app/(workspace)/{page,discover/page,applications/page,resumes/page,settings/page}.tsx` | All five redesigned workspace pages; existing mutations retained                                |
| `src/app/login/page.tsx`                                                                    | Framed, responsive login; original OAuth component and server checks retained                   |
| `src/components/shared.tsx`                                                                 | Removed inactive match-score badge from job cards                                               |
| `package.json`, `package-lock.json`                                                         | Radix Popover; development-only axe browser checks                                              |
| `playwright.config.ts`, `tests/e2e/design.spec.ts`, `tests/e2e/auth.spec.ts`                | WebKit projects, design/accessibility checks, profile-menu selector update                      |
| `artifacts/redesign/`                                                                       | Desktop and iPhone previews in light/dark modes                                                 |
| `README.md`, `docs/ui-redesign.md`                                                          | Verification and release handoff                                                                |

Overview now has an actual stage distribution, deadlines, next actions, activity and real library opportunities. Applications offers desktop board/list and compact mobile status groups. Discover keeps search, filters, bookmarks, details and authorized editing. Resumes keeps upload/version/download controls and private document metadata. Settings adds appearance alongside existing profile/security/export functionality. Login preserves its bounded native and web sign-in behavior.

No auth service, API, database service, validation/business rule, Supabase migration, proxy, Capacitor configuration, native callback scheme, or RLS policy was changed. The pre-existing user modification to `ios-shell/ios/App/App/Info.plist` was preserved.

## Validation and limits

The browser harness builds a production Next.js app against an isolated local PostgreSQL/PGlite adapter and simulated Supabase OAuth. It exercises the actual application services, SQL/RLS functions, browser/server SDKs, and cookie flow. It is **not live Google or hosted Supabase verification**. Synthetic records in screenshots are clearly test fixtures and never enter production.

```sh
npm run lint
npx tsc --noEmit
npm test
npx playwright install chromium webkit
npm run test:e2e
CAPTURE_DESIGN=1 npm run test:e2e -- design.spec.ts
npm run build
```

Final local results:

| Check                                             | Result                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| `npm run lint`                                    | Passed                                                                      |
| `npx tsc --noEmit`                                | Passed                                                                      |
| `npm test`                                        | 14 passed, including PostgreSQL/RLS tests                                   |
| `npm run test:e2e`                                | 52 passed in 43.2s across Chromium desktop/iPhone and WebKit desktop/iPhone |
| Axe route checks                                  | No reported A/AA violations on tested light/dark workspace views and login  |
| Production build                                  | Passed with normal `.env.local` after browser tests                         |
| Capacitor sync                                    | Passed; App and Browser plugins registered                                  |
| Unsigned iOS simulator compile                    | Passed, Xcode 27.0; no install or launch performed                          |
| `npm run test:live`                               | Skipped: `INTERNOS_PERSISTENCE_TEST_TOKEN` unavailable                      |
| Live Google/Supabase Storage/device/LiveContainer | Not exercised; manual release checks remain                                 |

One five-worker run exceeded a five-second save assertion while the record was still saving. Browser/axe concurrency is now bounded at three workers; the complete final run passed without retries. The storage success test intercepts upload/download requests to verify UI wiring only; it does not establish live Storage persistence. No sensitive document contents are printed by these tests.

Browser tests cover all five workspace pages in light/dark, no horizontal document overflow, board/list changes, persisted note edits, modal bounds/focus, profile/activity popovers, appearance persistence, opaque and reduced-motion fallbacks, mobile tab target sizes, upload error recovery, and existing application/job/auth/native-handoff regressions. Axe checks WCAG A/AA rules including contrast on these rendered routes and login; this is not a complete accessibility certification. Screen-reader use and physical keyboard behavior still need manual checks.

Only small chrome regions blur; large scrollable documents and data surfaces do not. No continuous animation, shaders, new image assets, or animation runtime was added. Performance on real older iPhones and prolonged WKWebView scrolling has not been measured. Use Reduce transparency if blur is costly.

Safe areas use `viewport-fit=cover` and `env(safe-area-inset-*)`. Dialogs scroll inside the available visual viewport; focused fields use 16px mobile type to avoid automatic zoom. Navigation hides while a reduced visual viewport indicates an open software keyboard. Browser emulation does not reproduce a physical iPhone keyboard, notch/status bar, iOS file picker, or app lifecycle exactly.

WebKit browser checks validate Safari's rendering engine, not a launched Capacitor WKWebView. The hosted shell still loads production, so it cannot show this local redesign until the web release is approved and deployed. The native App/Browser plugins and `com.internos.mobile://auth/callback` remain intact. LiveContainer may route guest custom URL callbacks differently from a normally installed app; native OAuth there remains a device-specific test, not a guaranteed capability.

## Screenshots

`artifacts/redesign/` contains full-page `overview`, `discover`, `applications`, `resumes`, and `settings` screenshots for desktop/iPhone in light/dark, plus dark login previews. Full-page mobile captures show the fixed navigation at the original viewport position. These are real browser renders with synthetic accounts, not invented live statistics.

## Release and InternOS.ipa handoff — manual, not executed

1. Review these changes and commit the desired files, handling your pre-existing Info.plist edit separately. Obtain explicit deployment approval before deploying. This redesign needs **no new SQL migration or Supabase setting**. Existing Phase 2 migration and native OAuth allowlist requirements from README still apply.
2. In the **existing InternOS Vercel project**, deploy the reviewed commit using its configured Git integration or the Vercel dashboard. Preserve the existing production domain `https://internos-green.vercel.app` and its public Supabase environment variables. `NEXT_PUBLIC_SITE_URL` must remain that exact HTTPS origin. Do not publish the browser-test build/environment. Check deployment build logs and test the production URL before packaging.
3. On desktop and iPhone Safari, verify Google consent, reload persistence, all five protected routes, real application create/edit/status/history/delete, bookmarks/filters, private resume upload/new-version/download, profile save and sign-out. Cancel OAuth, revoke a session, and test an invalid callback. Check both themes, Reduce transparency, keyboard focus, VoiceOver, and browser zoom. Use two accounts to confirm isolation. Existing README has the detailed auth/native matrix.
4. Sync and open the current shell:

   ```sh
   npm ci --prefix ios-shell
   npm --prefix ios-shell run sync
   npm --prefix ios-shell run open
   ```

   Confirm `ios-shell/capacitor.config.ts` still points at production over HTTPS. In Xcode choose scheme **App**, an iPhone simulator, and Run. After login, confirm dismissal returns to the app; force-close/reopen, sign out, cancel consent, test upload/download and external links. Then repeat on a physical device with your signing team. Do not copy Safari cookies or inject tokens.

5. Reproduce the unsigned simulator compile if needed (this does **not** produce an installable device IPA):

   ```sh
   xcodebuild -project ios-shell/ios/App/App.xcodeproj -scheme App \
     -sdk iphonesimulator -configuration Debug \
     -derivedDataPath /private/tmp/internos-ios-redesign \
     CODE_SIGNING_ALLOWED=NO build
   ```

   This sync and compile passed locally with Xcode 27.0. The simulator product is `/private/tmp/internos-ios-redesign/Build/Products/Debug-iphonesimulator/App.app`.

6. **Only after deployment and device checks**, build an ARM64 device product for a LiveContainer test IPA. The following optional commands are documented only; they were not run:

   ```sh
   xcodebuild -project ios-shell/ios/App/App.xcodeproj -scheme App \
     -sdk iphoneos -destination 'generic/platform=iOS' -configuration Release \
     -derivedDataPath /private/tmp/internos-device-unsigned \
     CODE_SIGNING_ALLOWED=NO build
   mkdir -p /private/tmp/internos-ipa/Payload
   ditto /private/tmp/internos-device-unsigned/Build/Products/Release-iphoneos/App.app \
     /private/tmp/internos-ipa/Payload/App.app
   cd /private/tmp/internos-ipa
   zip -qry InternOS.ipa Payload
   ```

   Use a fresh staging directory for each package. This unsigned IPA is for a compatible guest loader; it is not a normal signed iPhone install or App Store package. A standard signed distribution instead requires choosing your team in Xcode, **Any iOS Device (arm64)** → **Product → Archive**, then Organizer → **Distribute App**, the appropriate registered distribution method, and export. Rename the exported IPA `InternOS.ipa`. Signing/provisioning options depend on your Apple account and distribution target.

7. Follow the current [official LiveContainer installation guide](https://livecontainer.github.io/) for the specific device/iOS version. In LiveContainer's Apps tab, tap **+**, choose `InternOS.ipa`, then select the imported app to launch. The [official project README](https://github.com/LiveContainer/LiveContainer) documents import, compatibility limits, and URL/file sharing. Confirm the Google custom-scheme callback reaches this guest, plus session persistence and file picker/download behavior. If callback routing fails there, compare a normally installed development build; preserve nonce/PKCE validation rather than weakening it. LiveContainer/device verification remains outstanding.
