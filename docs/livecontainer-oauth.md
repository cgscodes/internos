# LiveContainer OAuth repair and build 2 handoff

## Findings and root cause

A LiveContainer guest is not installed as an independent iOS application. Its `CFBundleURLSchemes` entry lets LiveContainer recognize the guest, but does not register `com.internos.mobile` with iOS Launch Services. Sending Safari directly to `com.internos.mobile://auth/callback` can therefore produce “Cannot Open Page — The address is invalid.” Adding that scheme again to the guest plist does not solve host routing.

The original IPA already contained the expected bundle identifier, App and Browser plugins, and AppDelegate/SceneDelegate forwarding. The existing repository also already had an HTTPS return relay, and a read-only request with synthetic state/code confirmed that the deployed relay exists. Consequently, this investigation does **not** establish whether the observed direct redirect came from an older web bundle, choosing the direct-install link, Supabase redirect fallback/configuration, or a host-specific issue. Production Supabase settings and the physical device were not inspected. The user confirmed the main LiveContainer instance but did not supply its version/build.

## Verified mechanism

Reviewed official LiveContainer source at revision `b0f53e8934df325970e9b6ff52932a43b585c424` (main identifies itself as 3.8.14):

- [UIKit+GuestHooks.m](https://github.com/LiveContainer/LiveContainer/blob/b0f53e8934df325970e9b6ff52932a43b585c424/TweakLoader/UIKit%2BGuestHooks.m): `LCDecodedURLStringFromControlURL`, `LCHandleControlAppURL`, and the UIApplication/UIScene hooks decode the `url` query value from standard base64 and replace the host control URL with the guest URL. The same source constructs `open-url` links when opening a guest scheme.
- [LCSharedUtils.m](https://github.com/LiveContainer/LiveContainer/blob/b0f53e8934df325970e9b6ff52932a43b585c424/LiveContainer/LCSharedUtils.m): separate `livecontainer-launch` routing selects a guest using a LiveContainer-specific bundle-folder identifier. InternOS does not guess or hard-code that identifier.
- [LiveContainer Info.plist](https://github.com/LiveContainer/LiveContainer/blob/b0f53e8934df325970e9b6ff52932a43b585c424/LiveContainer/Info.plist): the main host registers `livecontainer`; instance queries also reference `livecontainer2` and `livecontainer3`.
- [Official FAQ](https://livecontainer.github.io/docs/faq): guest URL opening through the Apps link control or supported share workflow.
- [Official cold-start issue #1339](https://github.com/LiveContainer/LiveContainer/issues/1339): reports dropped guest deep links on cold launch. It is closed upstream, but the installed device version is unknown, so this repair does not certify that host behavior.

Selected main-instance format:

```text
livecontainer://open-url?url=<percent-encoded standard base64 of the complete guest callback>
```

The decoded value is `com.internos.mobile://auth/callback?state=<nonce>&code=<one-use-PKCE-code>` (or a validated OAuth error). It never contains access tokens, refresh tokens, or the verifier. Encoding uses standard base64 followed by URLSearchParams percent encoding, retaining `+`, `/`, and `=` correctly. This is the documented/source-backed `open-url` mechanism, not an invented guest scheme registration.

## Changes

The existing relay is retained and made explicit for the main instance. The native start endpoint requests `/auth/native/return?state=<nonce>&target=livecontainer`. Before opening the provider browser, the native controller checks the Supabase origin/authorize path, Google provider, S256 challenge, same-origin HTTPS return path, nonce, and fixed target. A stale endpoint returning a direct guest callback now fails with a deployment/configuration error before opening Safari.

The return page presents **Open in LiveContainer** as the primary action. Direct-install and secondary-instance actions are inside **Using another installation?**, reducing accidental selection of the unsupported direct guest scheme. It explains that the original guest/data container must be used. No automatic custom-scheme redirect is performed.

The Capacitor callback parser now accepts either the normal decoded guest URL or one strictly validated `livecontainer[2|3]://open-url` envelope if the host passes that envelope through. It rejects nested envelopes, foreign URLs, malformed base64, extra/duplicate parameters, token-bearing URLs, invalid routes, and fragments. A host already unwrapping the URL continues to work normally. The original server-side nonce/expiry validation, same-origin exchange, PKCE verifier cookie, one-use authorization code, completed-flow replay handling, verified-session check, and ordinary WKWebView session cookies remain unchanged. Safari cookies are not copied and authentication tokens are not injected into the bridge.

Native AppDelegate/SceneDelegate and URL registration already forward through Capacitor and needed no alteration. The App/Browser plugins, bundle ID, remote server URL, WebKit configuration, and Capacitor config are preserved. The native build number is incremented from 1 to 2 to distinguish the rebuilt artifact. Capacitor sync was run before compilation. No migrations, application features, Gemini code, PDF parser, Sankey, or general design styles were changed.

Files modified:

- `src/lib/auth/native-contract.ts`: authorization validation and strict optional host-envelope decoding.
- `src/lib/auth/native-oauth.ts`: validate the returned provider URL before opening Safari.
- `src/lib/auth/native-return.ts`: fixed-target parsing without forwarding that routing metadata into the guest callback.
- `src/app/auth/native/start/route.ts`: explicit main-instance relay target.
- `src/app/auth/native/return/route.ts`: primary host return action and installation-specific guidance.
- `src/components/auth/google-sign-in-button.tsx`: guidance while native sign-in is pending.
- `ios-shell/ios/App/App.xcodeproj/project.pbxproj`: build number 2.
- `tests/native-auth.test.ts`, `tests/e2e/native-auth.spec.ts`: envelope, stale redirect, session/persistence, and replay regressions alongside existing invalid/expired/cancelled/PKCE tests.
- `playwright.config.ts`: include auth/native-auth tests in WebKit projects.
- `docs/livecontainer-oauth.md`, `docs/ios-ipa-build.md`, `README.md`: current repair/build handoff.

## Supabase and Vercel changes

Production settings were **not** changed automatically. In Supabase Authentication → URL Configuration, add this exact redirect allowlist pattern for the new start URL:

```text
https://internos-green.vercel.app/auth/native/return?state=*&target=livecontainer
```

Keep the existing web callback entries and legacy native return entries. The existing `https://internos-green.vercel.app/auth/native/return?state=*` pattern may already cover the added target query; the explicit pattern above makes the intended new shape clear. The `*` is for the random 64-character nonce. No `livecontainer://` allowlist entry is needed because Supabase redirects to HTTPS, and the HTTPS page generates the host link afterward. Do not configure the guest callback as the Site URL. The production Site URL should remain the normal `https://internos-green.vercel.app` web origin. The Google-console redirect remains Supabase's provider callback, not the guest or relay URL. See [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

**Redeploy Vercel.** The IPA loads the hosted web application; replacing the IPA alone will not publish these TypeScript/Next.js changes. Use the existing deployment workflow after reviewing this change. No deployment was performed here. If Safari goes straight to a custom scheme instead of the return page after deployment, inspect the actual `redirect_to` and Supabase Site URL/allowlist without sharing real callback codes or tokens.

## Verification

Passed locally:

- `npm run lint`.
- `npx tsc --noEmit`.
- `npm run build` with the normal local environment restored after browser testing.
- `npm test`: 49 unit/database tests, including existing RLS, tracking, PDF, analytics, and Gemini regressions.
- `npx playwright test tests/e2e/native-auth.spec.ts tests/e2e/auth.spec.ts --project=desktop --project=webkit-iphone`: 24 tests. Covers standard web login, separate Safari/app cookie jars, native callback routing, host envelopes, invalid/stale callbacks, replay rejection, expired state, cancellation, PKCE failure, session establishment, reload persistence, and sign-out.
- `npm --prefix ios-shell run sync`: App 8.1.2 and Browser 8.0.5 retained.
- Release ARM64 physical-device build: `BUILD SUCCEEDED`, signing disabled.
- Release simulator build: `BUILD SUCCEEDED` (compile only).
- Complete-bundle packaging, ZIP CRC, byte comparison to the built app, executable permissions, resources/frameworks, ARM64 device platform, callback scheme, bundle ID, and checksum checks.

Browser OAuth and Capacitor bridge delivery are **simulated** against the local Supabase adapter. Simulator/device compilation does not test physical LiveContainer URL interception. Live Google authentication, physical iPhone behavior, the installed host's version-specific routing, and live Supabase configuration remain **unverified**. No physical device was available through these tools.

## Install on the physical iPhone

1. Review/apply the Supabase allowlist entry above and deploy the web change to the existing Vercel project.
2. Transfer `ios-shell/ipa-output/InternOS.ipa` to Files on the iPhone using AirDrop or iCloud Drive. Keep it zipped.
3. In the **main LiveContainer**, import it using Apps → **+**. Use the supported replace/update action for the existing InternOS guest and retain its original data container; avoid deleting it if existing cookies/data must be retained. Build 2 is still bundle ID `com.internos.mobile`, version 1.0.
4. Launch InternOS and start Google sign-in. Complete Google, then tap **Open in LiveContainer** on the HTTPS return page. Do not choose the direct-install action for a guest. Accept iOS's host-opening prompt; if asked, select InternOS in the original data container.
5. Confirm authenticated navigation, close/reopen persistence, reload, cancellation, sign-out, and expired/replayed link rejection. Record the LiveContainer version/build, iOS version, and whether the guest stayed running. Do not publish real callback URLs.
6. If the host opens but loses the guest callback, keep the original guest running and retry a fresh sign-in. Expired attempts require starting over; the three-minute limit is retained. Older/custom LC instances, separate data containers, or incompatible cold-start handling may still fail. The unsigned IPA needs a compatible, correctly configured LiveContainer import/signing setup; it is not an App Store or ordinary directly installable signed IPA.
