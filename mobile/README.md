# Bravo K9 — iOS and Android companion

A React Native / Expo app using Bravo’s existing black-and-gold identity, local brand assets, and the live website at https://bravounleashed.com.

**Status: internal alpha with a signed Android APK and an iOS simulator build.** Physical iPhone distribution still needs Apple signing credentials and device registration. This is not an App Store / Google Play release and has not completed physical-device acceptance. Built from website branch `bravo-mern` at `07a087e483dd0b0a394546b7b436dc1cd4f791bd` (PR #127). This addition does not change the website server, database, checkout, or live-stream transport.

## Included

- Native Home and Training screens with the existing shield, photography, Bebas Neue and Montserrat.
- Live service pricing from `GET /api/config`. Failed/disconnected reads never substitute a hardcoded price. Closed services are excluded. Specialist programs retain separate-quote language.
- Public live-session discovery from `GET /api/live`, with expiry checks. Private sessions are accessed through the signed-in website.
- A native, offline practice journal: add/edit/delete entries, filter by dog, weekly totals, and system sharing. It is device-local, versioned, and explicitly separate from paid session records. It does not sync between devices or website accounts. The native app requests Android backup exclusion; iOS system backups may include local app data.
- Restricted in-app member portal for booking, schedules, accounts, Bravo Room, workshops, live viewing, and authorized staff workspace. Existing website permissions and cookies remain authoritative. External HTTPS destinations open in the system browser. The app never copies passwords or extracts session cookies.
- Broadcasting opens the existing website in the phone browser. The app does not request camera/microphone access. Native broadcasting and push notifications are not implemented.
- Loading, retry, offline messaging, safe-area layouts, Android back behavior, accessible controls, and dark launch screen.

## Run

Node 24 or newer:

```sh
cd mobile
npm ci
npm start
```

Scan the development QR with a matching Expo Go version. Use a physical device or a development build for final portal/WebView checks. `npm run web` previews the native screens in a browser; protected member workflows open the website separately. Website API CORS restrictions may prevent public reads in a browser preview; native reads do not have browser CORS restrictions. Do not weaken website CORS or CSRF protections for the preview.

```sh
npm run typecheck
npm run lint
npm test
npm run export:all
npx playwright install chromium
npm run test:ui
npx expo-doctor
npx expo prebuild --no-install
```

The web UI tests use intercepted API responses to exercise offline and dynamic-price paths without mutating production. They are not a substitute for native device testing. Bundle export and prebuild are not signed IPA/APK builds.

## Installable builds

The app config targets the existing **Bravo app** project at https://expo.dev/accounts/ghostnet12s-team/projects/bravo-app, owned by `ghostnet12s-team` (project ID `6e045e71-3563-472b-9036-855ba473f3f7`). These non-secret identifiers were verified in the owner's Expo dashboard. The build workspace was authorized as `ghostnet12`, and Expo generated and manages the Android signing keystore. No signing secrets are committed. Android uses `com.bravounleashed.app`; iOS signing for that identifier has not been configured in this Expo project.

### First successful builds

Both builds use source commit `d1e15033513690ff6d9edf24d70a9359330ffba5`, app version `0.1.0`, build version `1`, and Expo SDK 58. They completed on October 20, 2026 UTC (October 19 in America/Chicago).

| Target | Profile | Result |
| --- | --- | --- |
| Android phones and emulators | `preview` | [Signed APK, build 87b00415](https://expo.dev/accounts/ghostnet12s-team/projects/bravo-app/builds/87b00415-0332-4490-b943-cabaa232d160) |
| iOS Simulator on a Mac | `simulator` | [Simulator app, build ba27ea5f](https://expo.dev/accounts/ghostnet12s-team/projects/bravo-app/builds/ba27ea5f-f368-45e4-ada7-ec6198177938) |
| Physical iPhone | `preview` | Not built: Apple distribution certificate/provisioning credentials are not configured. |

The Android APK was downloaded and checked for ZIP integrity, the expected app identifier, compiled classes, and its JavaScript bundle. Its SHA-256 is `1d2bbe1928be65e9073d7f905601c7893c23ce262d66aac8a05604f7666fe59e`. The iOS simulator output was downloaded and inspected: bundle ID `com.bravounleashed.app`, version `0.1.0 (1)`, iPhone Simulator platform, native executable and JavaScript bundle present, no camera or microphone usage declarations. These checks do not replace physical-device acceptance. Mobile CI, lint, and TypeScript checks passed. The build archive excluded generated native directories and signing/environment secrets; EAS generated native projects from app config.

For another build, use an authorized Expo session:

```sh
npx eas-cli@latest login
npx eas-cli@latest project:info
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile preview
```

Use the generated Android APK and registered iPhone internal-distribution build for device acceptance. The `simulator` profile produces an iOS simulator build. Configure store records and signing before using the `production` profile. Do not submit this alpha as a finished store release.

## Before a store submission

1. Test on a real iPhone and Android: login/logout/session expiry/MFA/password setup; member and staff access; booking and schedule navigation; keyboard, text enlargement, VoiceOver/TalkBack; journal edit/delete/share; background/resume; cellular/offline recovery; live playback. Do not make real payments as a test.
2. Add a published mobile privacy policy and an in-app account-deletion flow backed by the website, plus the external deletion request page required by Google Play. Current contact/account-help links are not a completed deletion flow. Account creation exists in the website portal, so these requirements apply.
3. Review digital lesson access/purchases separately from physical training. This alpha does not implement Apple/Google in-app purchases; the website portal can still expose its existing digital offers. Resolve the store-specific billing route before distribution.
4. Verify external checkout return, file upload, PDF/calendar downloads, and WebView session persistence on both OS versions. Browser and WebView cookie stores are separate; a browser fallback may require signing in again. Downloads have a browser fallback; native download integration is not implemented.
5. Complete store listing, review access, content rating, privacy/data-safety disclosures, support URLs, screenshots, and signing under Bravo’s owner accounts. Native functionality and store approval must be assessed by the stores; they are not guaranteed.

Official references checked during implementation:
- https://docs.expo.dev/build/introduction/
- https://developer.apple.com/app-store/review/guidelines/
- https://support.google.com/googleplay/android-developer/answer/13327111

## Architecture and security boundaries

`src/app/` provides Expo Router screen routes; `src/AppScreen.tsx` holds the shared native layout and tabs. `src/Journal.tsx` owns journal persistence; `src/domain.ts` validates records, URLs, public prices, and live snapshots. `src/Portal.tsx` is the single website boundary. The portal only keeps the exact Bravo HTTPS origin inside its WebView, denies arbitrary URI schemes, and leaves authorization to the server. No injected JavaScript, bearer-token workaround, MongoDB credential, API secret, or permissive native-auth endpoint is added. Public reads send no account credentials. There is no production write from native code.

Web pages inside the portal preserve their own editing controls. Native promotional copy and bundled images currently require an app update; they are not wired into website press-and-hold editing. Service prices are read dynamically. Fonts retain their original licenses under `assets/fonts/`.
