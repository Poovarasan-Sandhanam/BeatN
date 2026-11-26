#!/usr/bin/env bash
# Runs BeatN's Maestro flows against the booted iOS simulator.
#
#   npm run e2e:ios                 # every flow in .maestro/
#   npm run e2e:ios -- --include-tags=smoke
#
# Needs: the Maestro CLI (brew install mobile-dev-inc/tap/maestro), a booted
# simulator with BeatN installed and its models already downloaded
# (npx expo run:ios --configuration Release, then finish onboarding once).
#
# BeatN locks behind Face ID / passcode, and Maestro cannot type a passcode
# it does not know. Rather than weakening the lock with a test backdoor, this
# script enrolls simulated Face ID and keeps answering the prompt with a match.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v maestro >/dev/null 2>&1; then
  echo "Maestro is not installed: brew install mobile-dev-inc/tap/maestro" >&2
  exit 1
fi
if ! xcrun simctl list devices booted | grep -q Booted; then
  echo "Boot an iOS simulator with BeatN installed first." >&2
  exit 1
fi
if ! xcrun simctl get_app_container booted com.beatn.app >/dev/null 2>&1; then
  echo "BeatN is not installed on the booted simulator: npx expo run:ios --configuration Release" >&2
  exit 1
fi

# Enroll simulated Face ID.
xcrun simctl spawn booted notifyutil -s com.apple.BiometricKit.enrollmentChanged 1
xcrun simctl spawn booted notifyutil -p com.apple.BiometricKit.enrollmentChanged

# Answer every Face ID prompt with a match. A match with no prompt showing
# does nothing.
(
  while true; do
    xcrun simctl spawn booted notifyutil -p com.apple.BiometricKit_Sim.pearl.match >/dev/null 2>&1 || true
    sleep 2
  done
) &
FACE_ID_LOOP=$!
trap 'kill "$FACE_ID_LOOP" 2>/dev/null || true' EXIT

# On exFAT, macOS writes ._ sidecars beside every edited flow; Maestro would
# try to parse them as flows.
node ./scripts/strip-appledouble.js .maestro >/dev/null

MAESTRO_CLI_NO_ANALYTICS=1 maestro test .maestro "$@"
