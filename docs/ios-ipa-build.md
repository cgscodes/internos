# InternOS IPA — LiveContainer OAuth build 2

The rebuilt artifact is **version 1.0, build 2**, bundle ID `com.internos.mobile`. The device Release and simulator Release builds succeeded with Xcode 27.0 (27A266a). The deployment target remains iOS 15.0.

- IPA: `ios-shell/ipa-output/InternOS.ipa`.
- Absolute path: `/Users/cgchukwuezi/Documents/GitHub/internos/ios-shell/ipa-output/InternOS.ipa`.
- Size: 651,574 bytes.
- SHA-256: `908f80a5f3313797b057c21bc5ba3453106a12d85afaa3523be34d056a9de402`.
- Architecture/platform: ARM64 / iPhoneOS, not a simulator executable.
- Signing: disabled for the LiveContainer guest workflow; confirmed unsigned.
- Callback: `com.internos.mobile://auth/callback`.
- Hosted application: `https://internos-green.vercel.app`.
- Plugins: AppPlugin and CAPBrowserPlugin preserved.
- Verification metadata: `ios-shell/ipa-output/verification.json`.

A fresh temporary Payload directory received the complete `.app` using `ditto`. Recursive ZIP packaging preserved executable permissions and included all 32 entries under Payload. ZIP CRC validation and comparison of every regular built `.app` file against its archived bytes passed. Required frameworks, native bridge, both storyboards, configuration, and fallback page are present. No environment files, provisioning/private-key files, or recognized secret-key markers were found in the package.

Commands used:

```sh
npm --prefix ios-shell run sync
xcodebuild -project ios-shell/ios/App/App.xcodeproj -scheme App \
  -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath ios-shell/build CODE_SIGNING_ALLOWED=NO clean build
xcodebuild -project ios-shell/ios/App/App.xcodeproj -scheme App \
  -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/internos-livecontainer-simulator CODE_SIGNING_ALLOWED=NO build
```

Logs: `/tmp/internos-livecontainer-device.log` and `/tmp/internos-livecontainer-simulator.log`. A skipped App Intents metadata-extraction warning is expected because this app does not use AppIntents.framework.

To reverify the package:

```sh
unzip -t ios-shell/ipa-output/InternOS.ipa
(cd ios-shell/ipa-output && shasum -a 256 -c InternOS.ipa.sha256)
```

See [the OAuth repair and installation handoff](livecontainer-oauth.md) for source-backed routing, changed files, exact Supabase allowlist configuration, Vercel deployment, physical installation, and test results. **Vercel must be redeployed**: the rebuilt IPA uses the hosted web application. Production settings were not changed and the web change was not deployed here.

**Physical LiveContainer Google sign-in remains unverified.** Local bridge tests, separate-cookie-jar tests, and successful native builds do not certify host interception on the user's iPhone. No simulator runtime or physical device installation was performed. This unsigned package requires a compatible LiveContainer import/signing configuration and cannot be installed directly as a normal signed app.
