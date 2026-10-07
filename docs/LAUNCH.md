# BeatN — Road to Launch

From where the code is today to live on the **App Store** and **Google Play**.

Companion docs: [BACKLOG.md](BACKLOG.md) (everything outstanding),
[ROADMAP.md](ROADMAP.md) (phase order), [RUNNING.md](RUNNING.md) (how to build
and test).

> **Status date:** 7 October 2026. Store rules change — re-check anything marked
> ⚠️ before relying on it.

---

## Part 1 — What is done

### Verified working

| | Evidence |
| --- | --- |
| On-device speech → text | Runs on a physical iPhone via EAS build; transcript produced correctly |
| iOS build pipeline | `eas build --profile development` succeeds; app installs and runs |
| Simulator build | Compiles and launches clean — `whisper.rn` and `llama.rn` link for `iphonesimulator` as well as device |
| Quality gates | `tsc --noEmit` clean · **277 tests / 21 suites** · `expo-doctor` passing |

### Built, tested, not yet user-visible

| Layer | What exists |
| --- | --- |
| **Domain** | `JournalEntry` + processing state machine, `Memory` (parked), UUIDv7. Pure TypeScript, no platform imports — enforced by a test |
| **AI core** | Engine ports (STT · generation · embedding · rerank), `InferenceArbiter` (serialises all inference), `ModelResidencyManager` (RAM-budgeted LRU), `ModelRuntime` (evicts models on backgrounding) |
| **Structured output** | Grammar-constrained decoding — the JSON Schema is derived from the Zod schema and compiled to GBNF, so malformed JSON is unrepresentable |
| **Data core** | SQLite schema + forward-only migrations, `JournalEntryRepository`, `ProcessingJobRepository`, device identity. FTS5 enabled |
| **Job queue** | `ProcessingQueue` with atomic claim, heartbeat, exponential backoff, and crash recovery; `transcribe` and `analyse` handlers, both idempotent |
| **Design system** | Light/dark palettes, spacing, type scale; `Text` `Button` `Card` `ProgressBar` `Screen` `ErrorBoundary` |
| **Onboarding** | One-button model download with size-weighted, resumable progress |

### Fixed along the way

Record gated on models · `metro.config.js` buffer resolution · Settings deep
link on denied microphone · Apple team mismatch · broken typecheck (96 errors)
· missing `expo-asset` peer dependency · models never unloaded (OOM risk) ·
recorder wedging on a failed write · job-queue event-loop starvation ·
structured-output failure on device.

---

## Part 2 — What is left

### Stage A — Close Phase 0 ⬜

| | Task | Who |
| --- | --- | --- |
| A1 | Record once on device; capture the benchmark block | **You** |
| A2 | Write the model decision; set `DEFAULT_BUNDLE_ID` | Me, from A1 |

Nothing downstream is safe to design around until the model is chosen on
measured numbers rather than a guess.

### Stage B — The actual product ⬜

| | Task |
| --- | --- |
| B1 | **Home** — entry list, empty state, per-entry processing status |
| B2 | **Record** — big button, timer, level, Stop and Cancel; entry saved instantly |
| B3 | **Entry detail** — transcript, summary, mood, topics, audio playback |
| B4 | Wire `ProcessingQueue` so processing is background, never a frozen screen |
| B5 | Developer screen — benchmarks, raw output, log, model override |
| B6 | Delete `SpikeScreen` |

Needs `expo-router` (approved, not yet installed).

### Stage C — Make it survivable ⬜

| | Task | Why it blocks launch |
| --- | --- | --- |
| C1 | Stream recordings to disk (defect 4) | A long entry currently holds ~3× its size in RAM |
| C2 | Clean up orphaned audio (defect 3) | ~1.9 MB/min accumulates with nothing deleting it |
| C3 | Checksum model downloads (B6) | A corrupt model currently loads as valid |
| C4 | Device-tier model selection (B7) | A low-RAM phone gets the big model and dies |
| C5 | Encryption at rest + biometric lock | A journal on a lost phone is readable today |
| C6 | ESLint | Nothing catches hook-dependency or logging mistakes |
| C7 | Real-SQL tests (`sql.js`) | No test executes a single SQL statement today |
| C8 | Crash reporting with content redaction | You cannot support an app you cannot debug |

### Stage D — Release engineering ⬜

| | Task |
| --- | --- |
| D1 | ⚠️ Confirm Android targets **API 36** — required for all new apps and updates since 31 Aug 2026. Pin via `expo-build-properties` if the SDK default is lower |
| D2 | Add `ios.buildNumber` and `android.versionCode`, or use EAS remote versioning (`appVersionSource: "remote"` is already set) |
| D3 | Production icons and splash for both platforms |
| D4 | Test on a small phone (iPhone SE) and a large one; ⚠️ Apple may reject on iPad rendering **even with `supportsTablet: false`** |
| D5 | `eas build --profile production --platform all` |
| D6 | Verify the production build on real hardware — not just the dev build |

---

## Part 3 — Store requirements

### Both stores

| | Item |
| --- | --- |
| S1 | **Privacy policy, publicly hosted.** Required by both. Must state that audio and transcripts stay on device and what (if anything) leaves it |
| S2 | **Support URL / contact** |
| S3 | Screenshots per required device size |
| S4 | Title, subtitle, description, keywords, category |
| S5 | Content rating questionnaire |
| S6 | **A clear "not a medical device" position.** BeatN infers mood. Keep every claim descriptive, never diagnostic, and say so in the listing. This is the most likely reason either store pushes back |

### Apple App Store

| | Item | Notes |
| --- | --- | --- |
| A-1 | Apple Developer Program | ✅ you have it — team `6J75KC7K4S`, paid |
| A-2 | App record in App Store Connect | Bundle id `com.beatn.app` |
| A-3 | **App Privacy questions** | Declare data collection honestly. If nothing leaves the device, the answer is largely "not collected" — a genuine selling point |
| A-4 | Export compliance | ✅ `ITSAppUsesNonExemptEncryption: false` already set. Revisit if you add encryption at rest (C5) |
| A-5 | Microphone purpose string | ✅ already set |
| A-6 | TestFlight round before submitting | |
| A-7 | App Review | Expect questions about on-device AI and mood inference. Explain the model is bundled/downloaded and runs locally |

### Google Play

| | Item | Notes |
| --- | --- | --- |
| G-1 | Play Console account — **$25 one-off** | ⚠️ Do you have one? Not set up in this repo |
| G-2 | ⚠️ **Developer identity verification** | Mandatory for new personal accounts from September 2026: identity proof, address proof, phone |
| G-3 | ⚠️⚠️ **12 testers, 14 consecutive days** | Personal accounts created after 13 Nov 2023 cannot get production access until a closed test runs with ≥12 opted-in testers for 14 straight days. **Organisation accounts are exempt.** This is calendar time — start it the moment you have a testable build |
| G-4 | ⚠️ **Target API 36** | Required for new apps and updates since 31 Aug 2026 |
| G-5 | **Data safety form** | Play's equivalent of Apple's privacy questions |
| G-6 | Upload key / Play App Signing | EAS manages this |
| G-7 | Service account JSON for `eas submit` | Created in Google Cloud, granted access in Play Console |
| G-8 | `.aab`, not `.apk` | EAS produces this by default |

---

## Part 4 — Release commands

```sh
# Production builds for both platforms
npx eas-cli@latest build --profile production --platform all

# Submit (after the store records exist and metadata is filled in)
npx eas-cli@latest submit --platform ios --latest
npx eas-cli@latest submit --platform android --latest
```

EAS Submit uploads the binary only. **Listing text, screenshots and release
notes are entered by hand in App Store Connect and Play Console.**

---

## Part 5 — Suggested order

The two Google gates are calendar time, not work time. Start them early or they
become the critical path.

```
NOW ──► A1  benchmark on device                      ← you, ~5 min
        A2  model decision

        ├─► Stage B   the three screens  (bulk of the work)
        │
        └─► G-1/G-2   Play account + identity verification   ← start immediately,
                      verification can take days                 runs in parallel

Stage B done ──► internal TestFlight + Play internal testing
                 │
                 ├─► G-3  start the 12-tester / 14-day closed test  ← 14 days minimum
                 │        recruit testers BEFORE you need them
                 │
                 └─► Stage C  hardening, in parallel with the 14 days

Stage C done + 14 days elapsed ──► Stage D ──► submit both stores
```

**The honest schedule risk is G-3.** Fourteen consecutive days with twelve real
opted-in testers is slow and easy to get wrong — testers must actually opt in
via the link and stay opted in. If BeatN might ship under a company, an
**organisation Play account is exempt from the closed-testing requirement
entirely** and is worth considering before you register.

---

## Part 6 — Launch gates

Do not submit until all of these are true.

- [ ] Benchmarks recorded; model choice justified by measurement
- [ ] Record → transcript → reflection works on a physical device, repeatedly
- [ ] App survives backgrounding with models loaded
- [ ] Entries persist across app restarts; interrupted processing resumes
- [ ] A long recording does not spike memory
- [ ] Audio storage cannot grow unbounded
- [ ] No transcript, audio, prompt or model output reaches any log or analytics
- [ ] Journal is encrypted at rest and behind a device lock
- [ ] Tested on a low-end Android and an older iPhone, not just flagships
- [ ] Privacy policy published and linked
- [ ] No diagnostic or clinical language anywhere in the app or listing
