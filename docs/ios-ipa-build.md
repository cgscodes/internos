# InternOS IPA build receipt

Built locally on November 12, 2026 for LiveContainer testing. No application design, authentication architecture, database, native callbacks, transport security, or production deployment was changed. Generated build and IPA directories are ignored by Git.

## Artifact

- File: `ios-shell/ipa-output/InternOS.ipa`
- Absolute path: `/Users/cgchukwuezi/Documents/GitHub/internos/ios-shell/ipa-output/InternOS.ipa`
- Size: **651,574 bytes** (651.574 kB / 0.6214 MiB).
- SHA-256: `058343fe60d77465f8a225ff1f018f9769ec2f690ddfe155dd1c853fa048610f`
- Bundle identifier: `com.internos.mobile`.
- Display name: InternOS. Version/build: `1.0` / `1`.
- Executable: `Payload/App.app/App`, ARM64 Mach-O for **iOS devices**, not a simulator binary.
- Minimum iOS version: **15.0**, verified in the built plist and executable load commands. Embedded Capacitor/Cordova binaries also declare iOS 15.0.
- Toolchain: **Xcode 27.0**, build **27A266a**; device and simulator SDKs **27.0**.
- Signing: explicitly disabled with `CODE_SIGNING_ALLOWED=NO`. `codesign -d` confirms the app is unsigned. This is not a normally installable signed distribution IPA.
- Machine-readable verification: `ios-shell/ipa-output/verification.json`.
- Checksum file: `ios-shell/ipa-output/InternOS.ipa.sha256`.

## Verification performed

| Check                                                 | Result                                                                                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run lint`                                        | Passed                                                                                                                                                                   |
| `npx tsc --noEmit`                                    | Passed                                                                                                                                                                   |
| `npm run build` with normal `.env.local`              | Passed                                                                                                                                                                   |
| `npm --prefix ios-shell run sync`                     | Passed; App 8.1.2 and Browser 8.0.5 registered                                                                                                                           |
| Release ARM64 device build                            | `BUILD SUCCEEDED`                                                                                                                                                        |
| Release simulator build                               | `BUILD SUCCEEDED`; compile only, not launched/installed                                                                                                                  |
| ZIP CRC/integrity                                     | Passed, all 32 archive entries under `Payload/`                                                                                                                          |
| Built-bundle comparison                               | Every regular source `.app` file matches archived bytes                                                                                                                  |
| Bundle ID, device platform and executable permissions | Passed                                                                                                                                                                   |
| Native callback scheme                                | `com.internos.mobile` retained; application contract remains `com.internos.mobile://auth/callback`                                                                       |
| Native plugin code                                    | AppPlugin and CAPBrowserPlugin Objective-C classes present in App executable                                                                                             |
| Runtime dependencies                                  | Capacitor.framework and Cordova.framework embedded; linked non-system frameworks present                                                                                 |
| Bridge/resources                                      | `native-bridge.js` in Capacitor.framework, privacy manifests, public fallback, Cordova scripts, config, compiled icon assets and both storyboards present                |
| Sensitive bundle material                             | No `.env` files, recognized private-key/secret-key markers, service-role JWTs, or matching configured local private environment values detected; values were not printed |
| Production URL                                        | `https://internos-green.vercel.app/login` returned HTTP 200                                                                                                              |
| Deployed native endpoints, read-only GET              | `/auth/native/start` and `/auth/native/callback` returned 405 (POST routes); `/auth/native/session` returned 200                                                         |

The native project uses Swift Package Manager with `App.xcodeproj`, not a standalone `App.xcworkspace`. Capacitor 8.6.0 and its generated `CapApp-SPM` package were preserved. App/Browser plugins are linked into the executable; they do not require separate plugin frameworks in this build. Capacitor's bridge lives at `Frameworks/Capacitor.framework/native-bridge.js`, not `public/capacitor.js`.

The only device-build warning was skipped App Intents metadata extraction because this app has no AppIntents.framework dependency. It did not prevent compilation.

The original icon is a valid 1024×1024 Capacitor default icon; the launch storyboard uses the existing Capacitor splash. They compile successfully and were deliberately retained. They have not been replaced with InternOS-specific native artwork.

## Build commands used

From the repository root:

```sh
npm --prefix ios-shell run sync
xcodebuild -project ios-shell/ios/App/App.xcodeproj -scheme App \
  -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath ios-shell/build CODE_SIGNING_ALLOWED=NO build
xcodebuild -project ios-shell/ios/App/App.xcodeproj -scheme App \
  -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/internos-ipa-simulator \
  CODE_SIGNING_ALLOWED=NO build
```

Device product: `ios-shell/build/Build/Products/Release-iphoneos/App.app`.

The complete bundle was copied with `ditto` into a fresh temporary `Payload/App.app`, zipped recursively with symlinks/permissions retained, validated, then moved to the final output path. No framework, entitlement, signature, or security mechanism was patched or stripped.

Local logs:

- `/private/tmp/internos-ipa-web-build.log`
- `/private/tmp/internos-ipa-device-build.log`
- `/private/tmp/internos-ipa-simulator-build.log`

To check the delivered artifact again:

```sh
unzip -t ios-shell/ipa-output/InternOS.ipa
cd ios-shell/ipa-output
shasum -a 256 -c InternOS.ipa.sha256
```

## Hosted interface and device limitations

The shell loads the hosted production website over HTTPS. The local Next.js build is not embedded into this IPA, and rebuilding the shell does not publish web changes. At packaging time, production login still rendered the earlier `WELCOME TO INTERNOS` interface rather than the redesigned `Good to have you here.` interface/appearance controls. **This IPA therefore shows the currently deployed production UI.** Deploying the redesign remains a separate action requiring approval; no deployment was performed here.

The redesigned CSS uses standard/prefixed WebKit backdrop filters, solid fallback surfaces, reduced transparency/motion settings, safe-area insets, and visual-viewport sizing. Prior redesign checks exercised Chromium and WebKit; this task compiles the actual native bridge. These checks do not prove rendering performance or lifecycle behavior in a physical WKWebView. The remote app, Google provider configuration, network availability, and iOS/LiveContainer runtime determine actual behavior.

No physical device or LiveContainer guest launch was exercised. Unsigned import alone does not prove launch compatibility. Use LiveContainer's supported signing configuration for your installation and follow its [official setup documentation](https://livecontainer.github.io/). The [official project](https://github.com/LiveContainer/LiveContainer) documents IPA import and notes that some apps are incompatible. No bypass, exploit, or LiveContainer modification was implemented.

A guest custom URL callback may route differently from a normal iOS installation. Verify that completing Google OAuth returns `com.internos.mobile://auth/callback` to this guest, dismisses the system browser, and completes in the original WebView. Keep nonce/PKCE validation intact if routing fails. Compare a normally installed signed development build when diagnosing LiveContainer-specific behavior.

## Transfer and import

1. AirDrop `ios-shell/ipa-output/InternOS.ipa` from Finder to the iPhone, or copy it to iCloud Drive. Save it in **Files**. Do not unzip it.
2. Open a correctly configured LiveContainer installation. In **Apps**, tap **+**, select **InternOS.ipa** from Files, and let LiveContainer complete its supported import/signing process. Select InternOS to launch it. See the [official import instructions](https://github.com/LiveContainer/LiveContainer#installing-apps).
3. If signing or launch fails, check LiveContainer's certificate/setup and device compatibility; this artifact intentionally has no Apple distribution signature.
4. Verify Google login, cancellation, expired-session recovery, sign-out, app close/reopen persistence, protected routes, original posting links, resume file picking/downloads, keyboard/modal scrolling and safe areas. Test both light/dark and Reduce transparency after the redesigned web version is deployed.
5. Report the iOS version, LiveContainer version, and failing step if there is an issue. Do not share authorization codes, tokens, cookies, or private resume/application contents.
