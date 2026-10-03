# Running BeatN manually

Ordered steps, with the checks that tell you a step actually worked. Stop at the
first failure — later steps assume earlier ones passed.

See [DEVELOPMENT.md](../DEVELOPMENT.md) for *why* the exFAT and toolchain
workarounds exist, and [BENCHMARKS.md](../BENCHMARKS.md) for what to record.

---

## 0. Shell setup — every new terminal

```sh
cd /Volumes/ExtremeSSD/BeatN
nvm use          # 20.19.4, from .nvmrc
node -v          # must print v20.19.4
```

**This is not optional.** React Native 0.86.3 and whisper.rn require
`>=20.19.4`. If the default shell Node is newer or older, installs and builds
fail in confusing ways.

---

## 1. Verify without a device (fast, ~1 min)

Everything here runs on the Mac. Do this before any native work.

```sh
npm install
npm run typecheck     # expect: no output, exit 0
npm test              # expect: 8 suites, 106 tests passing
npx expo-doctor       # expect: 21/21 checks passed
```

If `npm test` reports a Babel syntax error on a `._*.test.ts` file, run
`npm run clean:appledouble` and retry.

---

## 2. Generate the native projects

Required after **any** change to `app.json` plugins or any new native package.
`expo-sqlite` (FTS5 + sqlite-vec) and `expo-asset` were added recently, so this
is needed now.

```sh
npm run prebuild
```

This runs `expo prebuild --clean --no-install`, strips AppleDouble sidecars,
then `pod install`.

⚠️ **`--clean` deletes and regenerates `ios/` and `android/`.** `ios/` is ~21 GB
after a build; expect this to take a long time and to re-download pods.

**Check it worked:** `ios/BeatN.xcworkspace` and `android/app/` exist, and
`pod install` ended without `[!]` errors.

---

## 3. Point the project at the right Apple team

**An Apple ID is already registered in Xcode.** The earlier
`No Account for Team "HJDB7FS8R4"` error did *not* mean the account was
missing — it meant the project was pinned to a team that account cannot use.

What is actually on this machine:

| | |
| --- | --- |
| Apple IDs registered in Xcode | 1 |
| Teams that ID can use | `6J75KC7K4S` — Poovarasan Sandhanam, Individual, paid |
| Certificate in the keychain | `HJDB7FS8R4` — a **different** team, not signed in |
| `DEVELOPMENT_TEAM` in `ios/` | unset, because `prebuild --clean` regenerates the project |

Because Continuous Native Generation rewrites `ios/`, the team must be set in
`app.json` rather than in Xcode, or it is lost on the next prebuild:

```json
{ "expo": { "ios": { "appleTeamId": "6J75KC7K4S" } } }
```

`@expo/config-plugins` reads `ios.appleTeamId` and writes `DEVELOPMENT_TEAM`
into every native target.

Check which teams your registered Apple ID can actually use:

```sh
defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier
```

If the team you want is not listed, *that* is when you add an account in
**Xcode → Settings → Accounts**.

## 4. Connect the iPhone

The phone is paired but shows as **offline**, which means it is not reachable
over USB right now.

1. Connect over **USB** (not Wi-Fi) and **unlock** the screen.
2. Tap **Trust This Computer** and enter the passcode.
3. On the phone: **Settings → Privacy & Security → Developer Mode** → on →
   restart when prompted.

**Check it worked:**

```sh
xcrun xctrace list devices | sed -n '/== Devices ==/,/== Simulators ==/p'
```

Your iPhone must appear under `== Devices ==`, **not** under
`== Devices Offline ==`.

---

## 5. Build and run on the device

```sh
npx expo run:ios --device
```

Pick your iPhone when prompted. First build is slow (whisper.cpp and llama.cpp
compile from source).

> `npm run ios --device` does **not** work — npm treats `--device` as its own
> config flag. Use `npm run ios -- --device` or the `npx` form above.

Then, in a second terminal:

```sh
nvm use
npm start        # Metro, with --dev-client
```

### Simulator

```sh
npx expo run:ios
```

Fine for UI smoke tests. **Useless for benchmarks** — the numbers are your
Mac's, not a phone's. Never record simulator results in BENCHMARKS.md.

### Android

```sh
adb devices              # your device must be listed
npx expo run:android
```

If the Gradle build fails with
`Could not isolate parameters … InstrumentationAnalysisTransform`, that is the
AppleDouble issue. Run it twice:

```sh
npm run clean:appledouble
npx expo run:android
```

---

## 5a. Device smoke test — do this before benchmarking

Ordered so the cheapest, most likely failures surface first. Stop at the first
one that fails; a later step depending on it will only confuse the picture.

| # | Check | Pass looks like | If it fails |
| --- | --- | --- | --- |
| 1 | **App launches** | "Starting BeatN…" then the onboarding screen | A blank screen means the error boundary itself failed to mount — check Metro output |
| 2 | **Onboarding renders** | "BeatN works offline." · *Standard · 1.2 GB* · Download button | — |
| 3 | **Dark mode** | Toggle in Control Centre; palette changes, text stays legible | — |
| 4 | **Download starts** | Progress bar moves; percentage climbs | Check Wi-Fi; HuggingFace URLs in `catalog.ts` |
| 5 | **Progress is size-weighted** | Bar crawls through the first ~5% (speech model), then the rest | If it sits at 50%, weighting is wrong |
| 6 | **Cancel and resume** | Cancel → Download again → **starts above 0%**, speech model skipped | — |
| 7 | **Transition** | On completion, lands on the spike screen automatically | — |
| 8 | **Relaunch** | Straight to the spike screen, no onboarding | Models failed the 95% size check |
| 9 | **Record gate** | Record is enabled (models present) | — |
| 10 | **Record → analyse** | Transcript appears *before* the reflection | — |
| 11 | **Benchmark block** | Section 5 shows RTF, TTFT, tokens/sec, JSON attempts | — |
| 12 | **Repeat recording** | A second and third run work without relaunching | Recorder wedged in `finalising` — B4 regression |
| 13 | **Background survival** | After a run, background the app ~30 s, return, record again | **The B1 fix.** A crash here means models were not evicted |
| 14 | **Microphone denial** | Deny the permission → message plus a working **Open Settings** button | — |

Only once 1–14 pass is a benchmark number worth recording.

## 6. Take a Phase 0 measurement

Phase 0 is not complete until this is done on **physical** hardware.

1. Launch the app → **1 · Models**.
2. Download one STT model and one LLM model. Defaults are
   `whisper-base-en-q5_1` and `qwen2.5-1.5b-instruct-q4_k_m` (~1.2 GB total,
   use Wi-Fi).
3. **2 · Record** → speak roughly **30 seconds** of ordinary speech → Stop.
4. Wait for transcription and reflection to finish.
5. Copy the block under **5 · Benchmark**.

### Memory, which the app cannot measure itself

`llama.rn` exposes no memory counter, so capture peak RSS by hand:

- **iOS:** Xcode → Product → Profile → Allocations, during a run.
- **Android:** Android Studio → Profiler → Memory.

### Record it

Paste the block into the results table in [BENCHMARKS.md](../BENCHMARKS.md),
then apply the decision rules in that file: RTF ≥ 1.0, TTFT > ~4 s, JSON
attempts routinely 2, or LLM load > ~10 s each change the model choice.

**A number that isn't written down didn't happen.**

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Invalid podspec file at .../._Expo….podspec` | AppleDouble sidecar | `npm run clean:appledouble` |
| `Could not automatically select an Xcode project` | `._BeatN.xcodeproj` | `npm run clean:appledouble` |
| `patch-package` reports package `._expo-modules-jsi` | sidecar in `patches/` | `npm run clean:appledouble` |
| Gradle `InstrumentationAnalysisTransform` failure | sidecars written *during* the build | clean, then build **twice** |
| Jest: `Unexpected character '\x00'` | sidecar test file | already handled by `testPathIgnorePatterns` |
| `No Account for Team "HJDB7FS8R4"` | no Apple ID in Xcode | step 3 |
| `RuntimeScheduler cannot be annotated…` | Xcode 26.3 / Swift 6.2.4 | `patch-package` should have applied; re-run `npm install` |
| Metro cannot resolve a native module | running Expo Go | Expo Go cannot work here — use the dev build |

**Expo Go will never work for this project.** `whisper.rn`, `llama.rn` and
`expo-audio`'s PCM stream are native modules; a development build is required.
