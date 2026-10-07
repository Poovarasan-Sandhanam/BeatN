# Backlog

Everything outstanding, in one place. Updated as work lands.
Phase ordering lives in [ROADMAP.md](ROADMAP.md); parked ideas in [IDEAS.md](IDEAS.md).

---

## 1. Needs you — nothing else can settle it

| | Task | Why it blocks |
| --- | --- | --- |
| **1d** | Record once on the phone, paste the benchmark block | No numbers exist. Every model choice is a guess until they do |
| **1e** | Model decision from those numbers | Sets `DEFAULT_BUNDLE_ID`, currently a provisional `standard` |

The committed build has the grammar fix. The thing to check is whether the
benchmark now reads `JSON attempts: 1` and `JSON grammar: yes (GBNF)`.
If attempts is still 2, the model is too weak and we go up a size.

---

## 2. Build — Step 2 remaining

| | Chunk | Notes |
| --- | --- | --- |
| 6 | **Home · Record · Entry detail** | The UX gap. Needs `expo-router` (approved). Everything it depends on exists |
| 7 | Developer screen | Benchmarks, raw output, event log, model override. Frees SpikeScreen to be deleted |

Chunk 6 also covers: per-entry processing states
(`Saved → Transcribing on device → Understanding on device → Ready`),
audio playback, and wiring `ProcessingQueue` — built in chunk 5 but
**started by nothing today**.

---

## 3. Open defects

| | Defect | Severity | Notes |
| --- | --- | --- | --- |
| 3 | Orphaned WAV files never cleaned up | medium | ~1.9 MB/min, nothing deletes. Needs a retention decision: keep audio forever (right for playback, ~1.1 GB/year at 10 min/day) or a window? |
| 4 | Whole recording held in RAM, ~3× at peak | medium | Plan ready: stream to disk via `FileHandle`, patch the WAV header at the end. Verified feasible |
| B5 | sqlite-vec unavailable on iOS | medium | `vec.xcframework` not shipped in expo-sqlite 57.0.3. Inert, not breaking. Parked with semantic search |
| B6 | Model integrity is a 95% size check | low-med | No checksum — a corrupt-but-right-size download loads as valid |
| B7 | No device-tier model selection | low | `recommendedBundle()` written and tested but never called. Needs `expo-device` |

---

## 4. Known gaps, not yet defects

- **No test executes real SQL.** `expo-sqlite` is mocked under Jest, so every
  repository is verified through a recording fake. The claim and
  stale-recovery queries in `ProcessingJobRepository` are the riskiest
  untested code in the project. `sql.js` as a dev dependency would close this.
- **No ESLint.** Nothing catches unused vars, missing hook deps or stray
  `console.log` outside `src/__tests__/architecture.test.ts`.
- **`expo-doctor`: 3 packages behind** — `expo` 57.0.26→27, `expo-asset`,
  `expo-sqlite` 57.0.3→4. Upstream patch bumps. `npx expo install --fix`
  resolves it, but invalidates the current EAS build.
- **SpikeScreen does not use the design system.** Deliberate — it becomes the
  developer screen in chunk 7.

---

## 5. Parked — do not build

Search, Ask/RAG, embeddings, insights, notifications, a separate Memory
entity, sync, backend, accounts, payments, cloud AI, multiple reasoning
models. See [IDEAS.md](IDEAS.md).
