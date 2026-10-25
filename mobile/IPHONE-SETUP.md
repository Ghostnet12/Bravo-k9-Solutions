# Install Bravo K9 on your own iPhone — free Apple account

This route uses your Mac and Xcode's **Personal Team** signing. No paid Apple Developer membership or Expo cloud signing is needed for this personal-device test. Apple limits free provisioning to seven days; reconnect and run the app from Xcode again when it expires. This does not distribute the app to customers, TestFlight, or the App Store.

**Current status:** the app has compiled successfully for the iOS Simulator. Your Mac must still compile, sign, and install the physical-iPhone build. This walkthrough and setup helper have not been run on your Mac or tested on your phone.

## 1. Install the Mac tools

- Install [Xcode from Apple](https://apps.apple.com/app/xcode/id497799835), open it, and complete its first-launch setup, including iOS support. Bravo's Expo SDK 58 requires Xcode **26.4 or newer**; use **Xcode 27 or newer for an iOS 27 phone**. Check [Apple's Mac and device requirements](https://developer.apple.com/xcode/system-requirements) if your Mac cannot install it. In Xcode **Settings > Locations**, select the installed Xcode version under **Command Line Tools**.
- Install [Node.js 24 LTS](https://nodejs.org/en/download), version 24.3 or newer, and reopen Terminal.
- Install [CocoaPods](https://guides.cocoapods.org/using/getting-started.html). If [Homebrew](https://brew.sh) is already installed, use `brew install cocoapods`. The helper checks these prerequisites before downloading project dependencies.

## 2. Download and prepare the app

Download the [mobile branch ZIP](https://github.com/Ghostnet12/Bravo-k9-Solutions/archive/refs/heads/feature/bravo-mobile-app-20261020.zip) and unzip it on your Mac. Inside the extracted folder, find **mobile**.

Open Terminal, type `cd ` (with a space), drag the **mobile** folder into Terminal, and press Return. Then run:

```sh
bash scripts/prepare-iphone.sh
```

The helper checks your Mac tools, installs the locked JavaScript dependencies, generates the iOS project when absent, installs native dependencies, and opens **BravoK9.xcworkspace** in Xcode. It does not request an Apple password or upload signing credentials. Dependency downloads and the initial build can take several minutes.

If you already cloned this feature branch, run the same command from its `mobile` directory. To reopen the prepared workspace later:

```sh
open ios/BravoK9.xcworkspace
```

## 3. Connect the phone and choose your account

1. Connect your iPhone to the Mac with a data-capable USB cable and unlock it. Accept **Trust This Computer** on the phone if prompted.
2. In **Xcode > Settings > Accounts**, add your Apple Account. Complete Apple's sign-in and any agreement directly in Xcode. Never paste your password or verification codes into chat.
3. In Xcode's left navigator, select the blue **BravoK9** project. Under **TARGETS**, select **BravoK9**, then open **Signing & Capabilities**.
4. Enable **Automatically manage signing** and set **Team** to your name followed by **(Personal Team)**. Let Xcode create the personal development signing assets. Do not select distribution signing or Archive.
5. Select your actual iPhone as the run destination near the Run button. If it does not appear, open **Window > Devices and Simulators**, pair it, and let Xcode finish preparing it.
6. On the iPhone, open **Settings > Privacy & Security > Developer Mode**, turn it on, restart if prompted, and confirm after restarting. If the setting is missing, first pair the phone with Xcode.

## 4. Install a build that works away from the Mac

1. In Xcode choose **Product > Scheme > Edit Scheme**.
2. Select **Run > Info** and change **Build Configuration** to **Release**, then close the dialog. This bundles the app's JavaScript and images into the app so it does not depend on a running development server. Release here is a build configuration; it does not change this into an App Store release.
3. Click the **Run** triangle or press **Command-R**. Keep the phone connected and unlocked while Xcode compiles, signs, and installs Bravo K9.
4. If iOS says the developer is untrusted, go to **Settings > General > VPN & Device Management**, open your developer profile, and trust it. Run again if needed.
5. Once the app opens, stop the Xcode run, disconnect the cable, and launch **Bravo K9** from the phone's Home Screen.

The journal should work offline. Current prices, the member portal, and live sessions still need internet access. Check Home, Training, journal save/edit/share, and your member login on the phone. Do not make a real payment as a test.

## Common blocks

| What you see | Next step |
| --- | --- |
| No account / no signing team | Add your Apple Account in Xcode Settings > Accounts, then select Personal Team on the BravoK9 target. |
| Bundle identifier cannot be registered | Share the exact error text, without credentials. The default is `com.bravounleashed.app`; a separate personal-test identifier may be needed. Do not change the production identifier as a workaround. |
| Device unavailable / unsupported iOS | Unlock and pair the phone; install a version of Xcode that supports its iOS version and finish downloading iOS platform support. |
| Metro connection / no bundle URL | Set the Run scheme to **Release**, rebuild, and reinstall. Debug mode normally needs a development server. |
| App stops opening after seven days | Reconnect the phone and press Command-R in Xcode to renew personal provisioning. Reinstall over the existing app; avoid deleting it if you want to keep the local journal. |
| Dependency or build failure | Share the first error in Terminal or Xcode, not passwords, certificates, or provisioning files. |

Local signing choices stay in ignored generated native files. The helper preserves an existing iOS project on reruns. If a future dependency or app-config change requires native regeneration, use Expo prebuild deliberately and reselect the Personal Team afterward; do not edit native application code by hand.

## References checked October 20, 2026

- [Apple: free Personal Team signing and seven-day limits](https://developer.apple.com/help/account/basics/about-your-developer-account/)
- [Expo SDK 58 platform requirements](https://docs.expo.dev/versions/v58.0.0/)
- [Expo local compilation and Release configuration](https://docs.expo.dev/guides/local-app-development/)
- [Expo: iPhone Developer Mode](https://docs.expo.dev/guides/ios-developer-mode/)

The existing [Expo Bravo app project](https://expo.dev/accounts/ghostnet12s-team/projects/bravo-app) remains linked. Paid Apple membership and separate distribution signing will be needed for the later EAS internal-distribution / TestFlight route. The broader store-release checklist remains in [README.md](README.md).
