# BeatN — Build & Learning Roadmap

## Current plan (authoritative)

Work follows this order. Do not skip ahead. Anything on the **Later** list goes
into [IDEAS.md](IDEAS.md) rather than into the codebase.

### Step 1 — Prove it works on a real device  🔵 in progress

| | Task | Status |
| --- | --- | --- |
| 1a | Defect: Record gated on models being downloaded | ✅ done |
| 1b | Defect: `metro.config.js` buffer resolution | ✅ done |
| 1c | Development build onto a physical iPhone | ✅ done — via `eas build --profile development` |
| 1d | Benchmark each model combination | ⬜ |
| 1e | Written model decision | ⬜ |

**Exit criteria:** benchmark numbers recorded in [BENCHMARKS.md](../BENCHMARKS.md)
for each model combination, plus a written model decision.

See [RUNNING.md](RUNNING.md) for the manual steps. An Apple ID **is** already
registered in Xcode; the signing problem is a team mismatch, not a missing
account.

### Step 2 — Smallest real experience  🔵 in progress

| | Chunk | Status |
| --- | --- | --- |
| 1 | Design system — tokens, theme, UI primitives (`src/shared/`) | ✅ done |
| 2 | Model bundles — auto-selection, combined weighted progress | ✅ done |
| 3 | First-run onboarding — one button, blocks recording until done | ✅ done |
| 4 | SQLite persistence — schema, migrations, repositories | ✅ done |
| 5 | Job queue — `processing_jobs`, resumes after restart | ✅ done — wired via `ServiceProvider` |
| 6 | Three screens — Home · Record · Entry detail | ✅ done (device-untested) |
| 7 | Developer screen — benchmarks, raw output, log, model override | ✅ done — long-press the Journal title |

Three screens: **Home** (entry list, empty state), **Record** (big button,
timer, level, Stop and Cancel), **Entry detail** (transcript, summary, mood,
topics, playback). Plus background processing with visible per-entry states.

Underneath: SQLite persistence, a `processing_jobs` table with a queue that
resumes after restart, and UUID + `createdAt` + `updatedAt` + soft delete on
every entity.

**Decided:** `expo-sqlite` (not `op-sqlite`) — SDK 57 ships FTS5 and sqlite-vec
as config-plugin flags, so no third-party native dependency is needed.
See SYSTEM_DESIGN §13 decision 10.

**Approved dependency:** `expo-router`, for chunk 6 only.

**Native projects regenerated** 2026-10-02: `npm run prebuild` succeeded,
`ExpoSQLite 57.0.3` is in `ios/Podfile.lock`, FTS5 is enabled. sqlite-vec is
inert on iOS — see SYSTEM_DESIGN §4.

**Exit criteria:** record several entries, kill the app, reopen it — everything
is still there and finishes processing.

> **Testing note for chunk 4.** `expo-sqlite`'s native module is mocked under
> Jest (`NativeDatabase is not a constructor`), so no test executes real SQL.
> Repositories are therefore tested through the `Database` port with a
> recording fake: that covers transaction boundaries, soft-delete semantics,
> state-transition guards and replace-not-append idempotency, but **not SQL
> syntax or constraint behaviour**. Those are first exercised when the app runs
> on a device. Adding a WASM SQLite (`sql.js`) as a dev dependency would close
> the gap — not done, as it needs approval.

### Later — do not build until asked

Search, Ask Journal / RAG, embeddings, insights, notifications, a separate
Memory entity, sync, backend, accounts, payments, cloud AI, multiple reasoning
models. Parked in [IDEAS.md](IDEAS.md).

### Other known defects (not yet scheduled)

| | Defect | Severity | Status |
| --- | --- | --- | --- |
| B1 | Models never unloaded; ~1.2 GB resident when backgrounded | **high** | ✅ fixed — `ModelRuntime` + `useModelLifecycle` |
| 3 | WAV files in `documents/recordings/` are never cleaned up | medium | ⬜ planned |
| 4 | Whole recording held in RAM (~3× at peak) — stream to disk before real use | medium | ⬜ planned |
| B4 | `useWavRecorder.stop()` has no `try/finally` — a failed file write wedges the recorder in `finalising` | medium | ⬜ |
| B5 | sqlite-vec unavailable on iOS (`vec.xcframework` not shipped in expo-sqlite 57.0.3) | medium | ⬜ parked with semantic search |
| B6 | Model integrity is a 95% size check, not a checksum | low-med | ⬜ |
| B7 | `recommendedBundle()` never called — no device-tier detection (needs `expo-device`) | low | ⬜ |
| B8 | Structured output failed on device (`AI_STRUCTURED_OUTPUT_INVALID`) | **high** | ✅ fixed — grammar-constrained sampling via `json_schema` |
| B9 | Spike screen UX is a developer instrument, not a product | medium | ⬜ chunk 6 |
| 5 | No deep link to Settings when microphone permission is denied | low | ✅ fixed |

---

## Reference: phases and what to learn

The sections below are longer-range reference material. Steps 1 and 2 above take
precedence where they differ.

Every phase below has the same four parts:

- **Build** — what ships.
- **Learn** — the concepts to understand *before* writing it. Skip these and the
  code works but the design doesn't.
- **Exit criteria** — objective, measurable. No phase ends on a feeling.
- **Trap** — the specific mistake that costs a rewrite.

Read [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) first. This document is how you get
there; that document is where you are going.

> **The discipline that matters most:** do not start a phase until the previous
> phase's exit criteria are objectively met. The whole point of Phase 0 is to
> stop you building six phases on an unmeasured assumption.

---

## Phase 0 — Feasibility (⚠️ in progress, blocked)

**Build:** one screen exercising record → Whisper → local LLM → validated JSON,
plus a benchmark readout. *(Done — `src/spike/SpikeScreen.tsx`.)*

**Learn:**
- Why Whisper needs 16 kHz mono 16-bit PCM, and why `expo-audio`'s recorder
  cannot produce it on Android. (See ARCHITECTURE.md — this is already solved
  in `useWavRecorder`, but understand *why* before you touch it.)
- **Real-time factor** (`processing ÷ audio duration`) — the single number that
  decides whether on-device STT is viable.
- **TTFT vs tokens/sec** — TTFT is what the user feels; tokens/sec is what the
  spec sheet brags about.
- **Quantization** (Q4_K_M, Q5_1) — the quality/size/speed trade.

**Exit criteria:**
- [ ] Benchmarks recorded on a **physical iPhone** and a **physical Android**.
- [ ] STT real-time factor **< 1.0** on both.
- [ ] A chosen STT model and generation model, justified by the numbers.
- [ ] Peak memory recorded by hand (Instruments / Android Studio Profiler).

**Status: blocked.** No physical device has been reachable. Unblock by
registering the Apple ID in Xcode → Settings → Accounts (the CLI build fails
with `No Account for Team "HJDB7FS8R4"`), enabling Developer Mode, and building
over USB.

**Trap:** choosing models from HuggingFace download counts instead of from your
own measurements. BENCHMARKS.md already encodes the decision rules — apply them.

---

## Phase 1 — Foundations

**Build:** `domain/`, the SQLite data core, migrations, repositories, the job
queue, and the AI gateway interfaces. No new user-facing features.

**Learn:**
- **The dependency rule** — why domain code importing `expo-sqlite` is the
  beginning of the end.
- **Ports and adapters** — the interface belongs to the consumer, not the library.
- **Repository pattern** — and why "just one query in the component" never stays one.
- **SQLite migrations via `PRAGMA user_version`** — forward-only, never edit a
  shipped migration.
- **WAL mode** — why readers stop blocking writers.
- **UUIDv7** — time-sortable IDs, and why that matters for cursors and sync.
- **Idempotency** — the property that makes a crash survivable.

**Exit criteria:**
- [ ] `domain/` imports nothing from React, Expo, or SQLite (enforced by lint).
- [ ] Migrations run from empty → current on a fresh install.
- [ ] Repositories unit-tested against in-memory SQLite, no device needed.
- [ ] A job survives app-kill mid-run and resumes on next launch.

**Trap:** designing the schema around today's screens. Design it around the
domain model in SYSTEM_DESIGN.md §3 — screens change, the shape of a memory
doesn't.

---

## Phase 2 — Capture

**Build:** the real record screen — waveform, pause/resume, cancel, background
handling, entry created immediately in `RECORDED`.

**Learn:**
- Audio session interruptions (calls, Siri, headphones, other apps).
- iOS background audio modes, Android foreground services.
- Why the entry row is written **before** any AI runs.
- Backpressure: a 10-minute recording is ~19 MB of PCM — stream it to disk,
  don't accumulate it in a JS array.

**Exit criteria:**
- [ ] A phone call mid-recording loses nothing.
- [ ] Entry appears in the journal in **< 300 ms** after stop.
- [ ] A 10-minute recording does not spike memory.

**Trap:** holding the whole recording in memory. The current spike does exactly
this — acceptable for a 30-second measurement, not for production.

---

## Phase 3 — Transcription

**Build:** `TranscribeJobHandler` behind the queue, with progress, cancellation,
and model residency.

**Learn:**
- Streaming vs batch transcription, and the latency/accuracy trade.
- Model load cost amortisation — when to keep warm, when to evict.
- Partial failure: what a half-transcribed entry should look like to the user.

**Exit criteria:**
- [ ] Transcription runs in the background; the UI stays at 60 fps.
- [ ] Killing the app mid-transcription resumes, does not restart.
- [ ] Transcript is visible before analysis begins.

**Trap:** blocking the UI on transcription. The user should be reading their
transcript while the reflection is still being generated.

---

## Phase 4 — Understanding

**Build:** the extraction pipeline — normalize → chunk → grammar-constrained
extraction → embed → index.

**Learn:**
- **GBNF grammars / `json_schema`** — constraining the sampler so invalid JSON
  cannot be produced. This is the big unlock; see SYSTEM_DESIGN.md §5.
- **Chunking strategy** — size, overlap, and why sentence boundaries beat fixed
  character counts.
- **Embeddings** — cosine similarity, normalization (`embd_normalize`),
  dimensionality, and why the embedding model must stay fixed once you index
  (changing it invalidates every vector).
- **Prompt versioning** — a prompt is code; it needs a version and tests.

**Exit criteria:**
- [ ] JSON validity ≥ 99% with grammar constraints on.
- [ ] A golden-set test for extraction quality that runs in CI without a device.
- [ ] Re-running extraction on an entry is idempotent.

**Trap:** one giant prompt that extracts everything. Separate, small, testable
extractions beat one clever one — and they fail independently.

---

## Phase 5 — Journal & Memory

**Build:** the journal UI, plus the memory extractor — distilling entries into
durable, evidence-backed `Memory` rows with dedup and merge.

**Learn:**
- Entity resolution — "mum", "Mum", "my mother" are one person.
- Memory deduplication and **supersession** — memories evolve; don't overwrite,
  supersede.
- Temporal reasoning — "last week" relative to entry time, not query time.

**Exit criteria:**
- [ ] Every memory has ≥ 1 source entry. Enforced by a DB constraint.
- [ ] Re-processing an entry does not duplicate its memories.

**Trap:** letting the model invent memories not grounded in an entry. The
`memory_sources` foreign key should make that impossible to persist.

---

## Phase 6 — Search & Ask (the killer feature)

**Build:** hybrid search and the RAG Ask flow with citations.

**Learn:**
- **Lexical vs semantic retrieval** — BM25 finds the exact word; vectors find
  the meaning. You need both.
- **Reciprocal Rank Fusion** — the simple, robust way to merge two ranked lists.
- **Two-stage retrieval** — cheap recall, then `context.rerank()` for precision.
- **Context window budgeting** — you have ~2048 tokens. What gets cut, and how
  you decide.
- **Grounded generation** — "answer only from the provided memories; if they
  don't support an answer, say so."

**Exit criteria:**
- [ ] Every answer cites tappable source entries.
- [ ] An unanswerable question returns "not enough in your journal" — tested
      explicitly with an adversarial set.
- [ ] TTFT < 2 s on the target device.

**Trap:** letting the model answer from its pretraining instead of from the
retrieved context. Test this deliberately: ask something it would "know" but
your journal never mentions.

---

## Phase 7 — Insights

**Build:** trends over time — mood, topics, recurring threads.

**Learn:** aggregation windows; the difference between a pattern and noise;
presenting correlation without implying causation.

**Exit criteria:**
- [ ] No insight renders without a minimum evidence threshold.
- [ ] No clinical or diagnostic language anywhere. BeatN is not a therapist.

**Trap:** generating insights from three entries. Sparse data produces confident
nonsense.

---

## Phase 8 — Notifications

**Build:** gentle, local, on-device reminders and resurfacing.

**Learn:** `expo-notifications` scheduling, permission timing (ask after value
is demonstrated, not on first launch), background task limits on both platforms.

**Exit criteria:** zero notification content leaves the device; all scheduling
is local.

---

## Phase 9 — Security & Sync

**Build:** SQLCipher at rest, biometric lock, the oplog, and the encrypted sync
relay.

**Learn:**
- Key derivation and Keychain / Android Keystore.
- **Hybrid Logical Clocks** — why wall-clock timestamps lose data.
- **Per-field last-writer-wins** vs per-row.
- **Envelope encryption** — so the relay stores ciphertext it cannot read.
- Key rotation and device revocation.

**Exit criteria:**
- [ ] Server-side inspection of the sync store reveals no plaintext content.
- [ ] Two devices editing different fields of one entry both retain their edit.
- [ ] A lost device can be revoked.

**Trap:** shipping sync before encryption. Retrofitting E2EE onto a populated
plaintext store is a migration nightmare.

---

## Phase 10 — Testing & Hardening

**Build:** the full test pyramid plus device-matrix performance runs.

**Learn:** testing non-deterministic AI output (golden sets, property-based
assertions, tolerance bands rather than equality); fault injection; low-memory
and thermal-throttle simulation.

**Exit criteria:**
- [ ] Domain and core covered without a device.
- [ ] Crash-recovery and OOM paths explicitly tested.
- [ ] Performance budgets from SYSTEM_DESIGN.md §9 met on the low-end target.

---

## Phase 11 — Production

**Build:** EAS build/submit pipeline, OTA updates, store assets, privacy
disclosures, crash reporting with content redaction verified.

**Learn:** EAS channels and release strategy; staged rollout; what App Store and
Play privacy labels actually require you to declare.

---

## The five foundations, in priority order

If you only do five things before touching UI:

| # | Foundation | Why first | Phase |
| --- | --- | --- | --- |
| 1 | Local AI abstraction | Lets you change models and providers without touching features | 1 |
| 2 | Domain + processing architecture | Prevents 1,000-line React components | 1 |
| 3 | Local memory / database | The actual product surface | 1 |
| 4 | AI pipeline + RAG | Turns a journal into a memory system | 4, 6 |
| 5 | Backend sync boundary | Keeps cloud optional and privacy structural | 9 |

---

## Working agreements

```sh
npm run typecheck     # must be clean
npm test              # must be green
npx expo-doctor       # before any native change
```

- A phase is not done until its exit criteria are checked off **in this file**.
- Record every device measurement in BENCHMARKS.md. A number that isn't written
  down didn't happen.
- When a decision is non-obvious, add a row to SYSTEM_DESIGN.md §13 — including
  the alternative you rejected and why.
