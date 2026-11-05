#!/bin/bash
# Prepare a local iPhone project. Signing stays in the owner's Xcode account.
set -euo pipefail

fail() {
  printf '\n%s\n' "$1" >&2
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "Run this setup on your Mac. See mobile/IPHONE-SETUP.md."

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

command -v node >/dev/null 2>&1 || fail "Install Node.js 24 LTS from https://nodejs.org/en/download, reopen Terminal, and try again."
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit((major === 24 && minor >= 3) || (major >= 26 && major % 2 === 0) ? 0 : 1)' || fail "Use Node.js 24.3 or newer on the 24 LTS line (or a supported newer even-numbered release)."
command -v npm >/dev/null 2>&1 || fail "npm is missing. Reinstall Node.js 24 LTS, reopen Terminal, and try again."

xcode_version="$(xcodebuild -version 2>/dev/null)" || fail "Install and open Xcode, complete its setup, then select Xcode under Settings > Locations > Command Line Tools."
xcode_number="$(printf '%s\n' "$xcode_version" | awk '/^Xcode / {print $2; exit}')"
node -e 'const [major, minor = 0] = process.argv[1].split(".").map(Number); process.exit(major > 26 || (major === 26 && minor >= 4) ? 0 : 1)' "$xcode_number" || fail "Bravo requires Xcode 26.4 or newer. For an iOS 27 phone, use Xcode 27 or newer."
xcrun --sdk iphoneos --show-sdk-path >/dev/null 2>&1 || fail "Install iOS platform support in Xcode Settings > Components, then try again."
command -v pod >/dev/null 2>&1 || fail "Install CocoaPods first. If Homebrew is installed, run: brew install cocoapods. See IPHONE-SETUP.md for the official installation links."
pod --version >/dev/null || fail "CocoaPods could not start. Repair its installation before continuing."

printf '\nInstalling the locked Bravo dependencies...\n'
npm ci

# Generate only when absent: rerunning setup must preserve local Personal Team
# signing choices. Expo config/plugins remain the native source of truth.
if [[ ! -d ios ]]; then
  printf '\nGenerating the iPhone project...\n'
  npx --no-install expo prebuild --platform ios --no-install
elif [[ ! -d ios/BravoK9.xcodeproj ]]; then
  fail "An unexpected ios directory already exists. Setup stopped without replacing it. See IPHONE-SETUP.md."
fi

printf '\nInstalling iOS native dependencies...\n'
pod install --project-directory=ios

[[ -d ios/BravoK9.xcworkspace ]] || fail "The Xcode workspace was not created. Share the first error shown above."

cat <<'NEXT'

Ready for your Apple account and connected iPhone:
1. In Xcode Settings > Accounts, sign in to your Apple Account.
2. Select the BravoK9 project, then TARGETS > BravoK9 > Signing & Capabilities.
3. Enable Automatically manage signing and choose your Personal Team.
4. Connect and unlock your iPhone, trust the Mac, and enable Developer Mode.
5. Choose your actual iPhone as the run destination.
6. Product > Scheme > Edit Scheme > Run > Info: set Build Configuration to Release.
7. Click Run (the triangle). Apple may ask you to trust your developer profile.

Use IPHONE-SETUP.md for the full walkthrough and troubleshooting.
This setup has not installed the app yet. Xcode completes signing and installation.
NEXT

open ios/BravoK9.xcworkspace
