# BeatN — System Design

> **Thesis.** BeatN is not "an AI journal app". It is a **private personal-memory
> engine** that happens to have a mobile UI. The engine is the product; the UI is
> its best interface. Everything below follows from that.

The product loop is `CAPTURE → UNDERSTAND → REMEMBER → CONNECT → REFLECT → ASK`.
Only the first two are a journal. The last four are what makes it defensible.

---

## 0. The constraint that drives every decision

BeatN runs its intelligence **on a phone**. That single fact invalidates most
cloud-AI architecture instincts:

| Cloud assumption | Phone reality | Consequence for this design |
| --- | --- | --- |
| Models are always available | A model is a 400 MB–1.1 GB file the user must download | §6 Model Registry; models are data, not code |
| You can run many models at once | RAM is the hard ceiling; Whisper + LLM + embedder will not co-reside | §7 Residency Manager — the piece most designs miss |
| Inference is concurrent | One CPU/GPU, one `llama_context` | §7 Inference Arbiter — all inference is serialized |
| Latency is network-bound | Latency is compute-bound and thermal | §9 never block the UI thread; measure RTF/TTFT |
| The backend owns the data | The device owns the data | §11 backend is optional and untrusted |

**Design rule:** any component that pretends inference is cheap, parallel, or
always-available is wrong and will have to be rewritten.

---

## 1. The four layers

```
┌──────────────────────────────────────────────────────────┐
│                      BEATN APP                           │
│                   React Native / Expo                    │
│   Home · Record · Journal · Search · Ask · Insights       │
└───────────────────────────┬──────────────────────────────┘
                            │  application services only
┌───────────────────────────▼──────────────────────────────┐
│                    LOCAL DATA CORE                       │
│  SQLite  ·  FTS5 (lexical)  ·  sqlite-vec (semantic)     │
│  Entries · Memories · Entities · Jobs · Oplog            │
└──────────────┬────────────────────────────┬──────────────┘
               │                            │
   ┌───────────▼──────────┐    ┌────────────▼─────────────┐
   │       LOCAL AI       │    │      CLOUD COMPANION     │
   │  Whisper · LLM       │    │  Auth · Sync · Backup    │
   │  Embeddings · Rerank │    │  Billing · Model catalog │
   │  RAG orchestration   │    │  Telemetry (anonymous)   │
   └──────────────────────┘    └──────────────────────────┘
                                  optional · untrusted
```

**The load-bearing property:** remove the right-hand box entirely and BeatN
still records, transcribes, understands, searches, and answers questions.
The backend is a *companion*, never a dependency.

---

## 2. Hard architectural rules

These are not style preferences. Violating one of them is the thing that forces
a rewrite in month nine.

1. **The dependency rule.** Dependencies point inward only.
   `UI → Feature → Application Service → Domain → Infrastructure`
   Domain code imports nothing from React, Expo, SQLite, or any AI library.

2. **No UI file imports an AI library or SQLite.** Not `llama.rn`, not
   `whisper.rn`, not `expo-sqlite`. If a screen needs data it calls a service.
   *(Already true today — `src/spike/` only touches the engine interfaces.)*

3. **Everything crosses a port.** Infrastructure is reached through an interface
   defined by the layer that needs it, not by the library that implements it.

4. **All persistent writes go through a repository.** No ad-hoc SQL in features.

5. **All inference goes through the arbiter** (§7). No component calls a model
   directly, because no component can know what else is running.

6. **Every AI-derived claim carries provenance.** Which model, which version,
   which source entries, what confidence. See §8.

7. **Private content never leaves the device unencrypted**, and never leaves at
   all without an explicit, specific user action. See §10.

### What this looks like in practice

```
RecordScreen                     ❌  RecordScreen
   ↓                                    ↓
RecordingService                     whisper.rn
   ↓                                    ↓
JournalEntryService                  llama.rn
   ↓                                    ↓
ProcessingQueue                      SQLite
   ↓
JournalEntryRepository
   ↓
SQLite
```

The left column survives swapping llama.cpp for Apple Foundation Models. The
right column does not survive anything.

---

## 3. Domain model

The domain is deliberately richer than the UI needs today. This is where future
capability comes from.

### JournalEntry — what the user said

```
JournalEntry
├── id, createdAt, updatedAt, deletedAt
├── Audio         { path, durationMs, sampleRate, byteLength }
├── Transcript    { text, language, provenance }
├── Reflection    { title, summary, provenance }
├── Mood          { value, confidence, provenance }
├── Topics        [{ name, confidence }]
├── Entities      [{ kind: person|place|organisation, name, confidence }]
├── Chunks        [{ index, text, embedding }]
├── ProcessingState
└── SyncMetadata  { version, deviceId, dirty }
```

### Memory — what it *means*, across time

A `Memory` is **not** an entry. It is a durable fact or thread distilled from
one or more entries, and it is the unit RAG retrieves.

```
Memory
├── id, kind: fact | preference | goal | event | relationship | thread
├── statement            "Wants to move from contracting into product work"
├── sourceEntryIds[]     evidence — never empty
├── firstSeenAt, lastSeenAt, mentionCount
├── entities[], topics[]
├── embedding
├── confidence
└── supersededBy         memories evolve; they are not overwritten
```

Why this matters: *"What was I thinking about when I started looking for a new
job?"* is answerable by retrieving memories and their source entries. It is not
answerable by summarising a list of notes. That difference is the product.

### MemoryEvidence — the anti-hallucination primitive

```
MemoryEvidence { sourceEntryIds[], relevanceScore, confidence }
```

Every generated statement is bound to evidence. The UI renders confidence
honestly:

- **High** — multiple corroborating entries → state it plainly, cite sources.
- **Medium** — one or two entries → hedge ("you mentioned…"), cite sources.
- **Insufficient** — say so. *Never* generate the claim.

> "You mentioned wanting to change jobs several times in September." ✅ cites 5 entries
> "You have been unhappy with your career for months." ❌ no evidence, and it diagnoses

---

## 4. Local data core

One SQLite database. FTS5 and sqlite-vec are both **built into expo-sqlite 57**
via config plugin flags, so there is no second datastore to keep consistent.

```json
["expo-sqlite", {
  "enableFTS": true,
  "withSQLiteVecExtension": true,
  "useSQLCipher": false
}]
```

> **Verified against the generated project, 2026-10-02.** `enableFTS` works: it
> adds `-DSQLITE_ENABLE_FTS5=1` to the bundled `sqlite3.c`, which ships with the
> package.
>
> **`withSQLiteVecExtension` is Android-only in expo-sqlite 57.0.3.** The
> podspec adds `vec.xcframework` to `vendored_frameworks` when the flag is set,
> but that framework is **not shipped** in the package — only
> `android/vec/*/vec.so` exists. CocoaPods drops the missing path silently: no
> warning at install, and zero references in the generated Pods project. The
> flag is therefore inert on iOS rather than broken, so it does not affect the
> build. Re-check this before building semantic search, and expect to need
> `op-sqlite` or a hand-vendored framework for iOS vector search.
>
> `useSQLCipher` is off until Phase 9 — it changes the on-disk format, so it
> needs key management in place first.

### Schema shape

```sql
journal_entries      -- the spoken record + derived reflection
entry_topics         -- normalised, so topics are queryable across entries
entities             -- people, places, organisations (deduplicated)
entry_entities       -- join, with per-mention confidence
entry_chunks         -- retrieval unit: ~1-3 sentences of transcript
memories             -- distilled, durable, evidence-backed
memory_sources       -- memory ↔ entry evidence join
processing_jobs      -- the durable work queue (§8)
oplog                -- append-only change log for sync (§11)
schema_migrations    -- PRAGMA user_version
```

Two virtual tables sit alongside:

```sql
CREATE VIRTUAL TABLE entry_fts USING fts5(
  text, content='entry_chunks', content_rowid='rowid', tokenize='porter unicode61'
);

CREATE VIRTUAL TABLE chunk_vec USING vec0(
  chunk_id INTEGER PRIMARY KEY, embedding FLOAT[384]
);
```

### Why chunks, not whole entries

Embedding a five-minute ramble into one 384-dim vector averages away everything
specific. Chunking at sentence-group granularity is what makes retrieval
precise. The chunk is the retrieval unit; the entry is the display unit.

### Design notes

- **IDs are UUIDv7** — time-sortable, so they double as a cursor and collide
  safely across devices during sync.
- **Soft deletes only.** `deleted_at` is a tombstone; sync needs it.
- **Provenance columns on every derived field** (`*_model_id`, `*_model_version`).
  When you upgrade the extraction model you must know what is stale.
- **WAL journal mode.** Reads never block the recording write path.

---

## 5. The AI pipeline — many small steps, not one big call

The single most common failure is `audio → LLM → everything`. It is slow,
unreliable, impossible to resume, and impossible to debug.

```
  Audio (16 kHz mono PCM → WAV)
    │
    ▼  SpeechToTextEngine
  Transcript
    │
    ▼  Normalizer          disfluencies, casing, sentence segmentation
  Clean transcript
    │
    ├─▼ Chunker ──────────────────────┐
    │                                 │
    ▼  Extraction (grammar-constrained)│
  { title, summary, mood, topics,     │
    entities, goals, events }         │
    │                                 ▼
    │                            EmbeddingEngine
    ▼                                 │
  MemoryExtractor                     ▼
    │                            chunk_vec + entry_fts
    ▼
  memories (+ dedup / merge against existing)
    │
    ▼
  READY
```

Each arrow is a **separately resumable job** (§8). If the app is killed between
"Transcript" and "Extraction", the next launch resumes at Extraction — it does
not re-transcribe.

### Structured output is constrained, not hoped for

`llama.rn` accepts a `json_schema` on completion and compiles it to a **GBNF
grammar**, so invalid JSON becomes *unrepresentable at the sampler* rather than
something to detect and retry.

```ts
await context.completion({
  messages: [...],
  json_schema: JSON.stringify(extractionJsonSchema),  // sampler-level constraint
  temperature: 0.2,
});
```

Zod still validates the result — grammar guarantees *shape*, not *semantics*
(an enum member can be well-formed and still wrong). The existing
retry-and-reparse path in `LlamaEngine` becomes the **fallback** for runtimes
without grammar support, not the primary mechanism.

> This directly answers the open question in BENCHMARKS.md: "JSON attempts
> routinely 2 → move to a constrained grammar". Build the grammar path first.

---

## 6. Model registry — models are data

Hard-coding two model IDs does not survive contact with real devices.

```
ModelDescriptor
├── id, kind: stt | generation | embedding | rerank
├── version, quantization, sizeBytes, sha256
├── requiredRamMb, contextLength, embeddingDims
├── capabilities[]        grammar | tools | multilingual
├── downloadUrl, minOsVersion
└── recommendedDeviceClass
```

Selection is a pure function, which makes it testable:

```
deviceProfile (RAM, cores, OS, thermal headroom)
      → selectModels(registry, profile)
      → { stt, generation, embedding }
      → download → verify sha256 → activate
```

`sha256` matters: the current 95%-of-expected-size heuristic catches truncated
downloads but not corrupt ones.

---

## 7. Residency and the arbiter — the piece most designs omit

You **cannot** hold Whisper, a 1.5 B generation model, and an embedding model
resident at once on a mid-range phone. The OS will kill you. So residency is an
explicit, managed resource.

```
        ┌──────────────────────────────────┐
        │        InferenceArbiter          │   serialized queue + priority
        │  (one inference at a time)       │
        └───────────────┬──────────────────┘
                        │ ensureResident(modelId)
        ┌───────────────▼──────────────────┐
        │     ModelResidencyManager        │   LRU under a RAM budget
        │  load / evict / keep-warm        │
        └───────────────┬──────────────────┘
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
      Whisper      Generation     Embedding
```

**Policy:**

- A **RAM budget** is derived from the device profile; the manager never exceeds it.
- **LRU eviction**, with a pin for the model the foreground task needs.
- **Keep-warm** the generation model while the user is in Ask; evict on background.
- **Priority queue**: user-initiated (Ask, foreground transcribe) preempts
  background backfill.
- Evict everything on `AppState → background` and on memory-pressure warnings.

This is why rule 5 exists. A component that calls `initLlama` directly cannot
know that Whisper is mid-transcription, and the result is an OOM kill.

---

## 8. The processing engine

```
RECORDED → TRANSCRIBING → TRANSCRIBED → ANALYSING → ANALYSED
         → EMBEDDING → INDEXED → EXTRACTING_MEMORIES → READY
                                                      ↘ FAILED
```

The state lives **in the database**, not in React state. The queue is a table:

```
processing_jobs(
  id, entry_id, type, status, priority,
  attempts, max_attempts, last_error,
  created_at, started_at, completed_at, not_before
)
```

Rules that make it production-grade:

- **Crash recovery.** On launch, any job `RUNNING` with a stale heartbeat is
  reset to `PENDING`. Nothing is lost by killing the app mid-transcription.
- **Idempotency.** Every handler is safe to re-run. Re-embedding replaces by
  `chunk_id`; it does not append.
- **Exponential backoff** via `not_before`, with a cap and `max_attempts`.
- **The entry is visible immediately.** The user sees their transcript while
  analysis is still queued. Never gate the UI on the slowest step.
- **One worker.** Concurrency is the arbiter's job, not the queue's.

---

## 9. Concurrency and performance

```
UI thread        gestures, animation, waveform        ← never blocked
    │
JS thread        orchestration, queue, SQL            ← no heavy loops
    │
Native / JSI     audio capture, Whisper, llama.cpp, embeddings
```

Rules:

- Audio buffers are converted on the native side or in small increments; never
  `map` over a 30-second Int16Array on the JS thread.
- Waveform level updates are throttled; React state is not a 100 Hz signal sink.
- Long inference reports progress through a JSI callback, not polling.

Budgets (**targets to validate on hardware, not claims** — see BENCHMARKS.md):

| Metric | Target | Fails if |
| --- | --- | --- |
| STT real-time factor | < 0.5 | ≥ 1.0 — model is unusable |
| Time to first token (Ask) | < 2 s | > 4 s — move analysis off the inline path |
| Entry visible after stop | < 300 ms | user waits on the slow path |
| Cold start to record-ready | < 1.5 s | capture friction kills the habit |
| Peak RSS during pipeline | < 60% device RAM | OOM kill risk |

---

## 10. Privacy and security

### Threat model

| Adversary | Mitigation |
| --- | --- |
| Lost/stolen device | SQLCipher at rest; key in Keychain/Keystore behind biometrics |
| BeatN's own backend | E2EE — server stores ciphertext it cannot read (§11) |
| Network observer | TLS; no private content in URLs or query params |
| Our own telemetry | Event names + numbers only; content is structurally excluded |
| A future careless `console.log` | Lint rule + typed logger that accepts no free text |

### Non-negotiables

- Transcripts, audio, prompts, model responses, moods, topics and entity names
  are **never** logged, never in telemetry, never in crash reports.
- Cloud AI, if ever offered, is **opt-in per action** with an explicit preview
  of exactly what will be sent. No silent upload, ever.
- The encryption key is derived on-device and never transmitted.

### Privacy as a visible feature, not a settings page

Processing states are surfaced in the UI as they happen:

```
● Recording
● Transcribing on device
● Understanding on device
● Saved privately
```

This is a product differentiator. Show it.

### Observability without content

Allowed: `recording_completed`, `transcription_completed`, `ask_used`,
`model_loaded`, `processing_failed` — each with `durationMs`, `modelId`,
`modelVersion`, `appVersion`, `deviceClass`, `os`, `errorCode`.

Forbidden by construction: anything derived from user speech. The logger's type
signature should make passing a transcript a **compile error**, not a code-review
catch.

---

## 11. The cloud companion

### Split

| Device (always) | Backend (optional) |
| --- | --- |
| Capture, transcription, analysis | Account, auth, device list |
| Embeddings, search, RAG, Ask | Encrypted backup + sync relay |
| All private content | Subscription and billing |
| Encryption keys | Model catalog, feature flags |
| | Anonymous telemetry |

### Sync is an oplog, not a database upload

Never `SQLite → upload the whole file`. That cannot merge, cannot resolve
conflicts, and cannot work on two devices.

```
local write
    │
    ├─► table row (fast local read path)
    └─► oplog row (append-only, encrypted)
             │
             ▼
        Sync Engine ──► backend relay ──► other devices
```

```
Operation { id, deviceId, entityType, entityId, op, payload, hlc, schemaVersion }
```

- **Hybrid Logical Clocks**, not wall time — phone clocks are wrong and users
  travel.
- **Last-writer-wins per field**, not per row, so two devices editing different
  fields of one entry both win.
- **Tombstones** for deletes; garbage-collect after all known devices ack.
- **Payloads are encrypted client-side.** The relay sees `{entityId, hlc,
  ciphertext}` and nothing else — it cannot know that entry 7 is about your job.

That last point is what makes "treat the backend as untrusted" a *technical*
property rather than a promise in a privacy policy.

---

## 12. Module layout

```
src/
  app/                    Expo Router routes — screens only, no logic
  features/               UI per feature: record, journal, search, ask, insights
  services/               application services — orchestration, transactions
    RecordingService.ts
    JournalEntryService.ts
    AskService.ts
  domain/                 pure TypeScript. No React, no Expo, no SQL.
    entry/  memory/  model/  shared/
  core/
    ai/
      AIOrchestrator.ts
      InferenceArbiter.ts
      ModelResidencyManager.ts
      ModelRegistry.ts
      engines/            SpeechToText · TextGeneration · Embedding · Rerank
      adapters/           WhisperRn · LlamaRnGeneration · LlamaRnEmbedding
      prompts/            PromptRegistry — versioned, testable
      structured/         JSON-schema → grammar, Zod validation
    data/
      db/                 connection, migrations, schema
      repositories/       JournalEntry · Memory · Entity · Job · Oplog
      search/             HybridSearch (FTS5 + vec + RRF + rerank)
    audio/                capture → PCM → WAV   (exists)
    jobs/                 ProcessingQueue, handlers, recovery
    sync/                 oplog, SyncEngine, crypto envelope
    telemetry/            typed, content-free logger
    bench/                measurement                        (exists)
```

Test the `domain/` and `core/` layers without a device. That is the point of
keeping them pure.

---

## 13. Key decisions

| # | Decision | Rationale | Alternative rejected |
| --- | --- | --- | --- |
| 1 | One SQLite DB for lexical and (later) vector search | One transaction, one consistency story | Separate vector store — dual-write and drift |
| 2 | Chunk-level embeddings | Whole-entry vectors average away specifics | Entry-level — imprecise retrieval |
| 3 | Grammar-constrained JSON | Makes invalid output unrepresentable | Generate-and-retry — slow, unreliable |
| 4 | Serialized inference behind an arbiter | One GPU, finite RAM | Ad-hoc concurrent calls — OOM kills |
| 5 | DB-backed job queue | Survives crashes; resumable | In-memory promises — work lost on kill |
| 6 | Oplog sync with HLC + per-field LWW | Deterministic multi-device merge | Whole-DB upload — cannot merge |
| 7 | Client-side encryption before sync | Backend untrusted by construction | TLS-only — server can read everything |
| 8 | Evidence required for every claim | Prevents hallucinated memories | Free-form generation — invents a life |
| 9 | Memories separate from entries | Enables cross-time reasoning | Entries only — a notes app |
| 10 | `expo-sqlite` over `op-sqlite` | FTS5 is compiled into the bundled `sqlite3.c` and verified present; no third-party native dependency, and this project's native build is already fragile (exFAT sidecars, Xcode 26.3 Swift patch). **Caveat:** sqlite-vec is Android-only in 57.0.3 — see below | `op-sqlite` — faster on paper, but more native build surface for a capability that is parked |

---

## 14. What is built today

| Area | Status |
| --- | --- |
| Audio capture → 16 kHz mono WAV | ✅ `src/core/audio/` |
| STT / LLM engine interfaces | ✅ correct shape, needs widening to §12 |
| Structured output + Zod | ✅ retry-based; grammar path to add |
| Model download/verify/remove | ✅ `ModelManager`; needs sha256 + registry |
| Benchmark harness | ✅ `src/core/bench/` |
| Everything else in this document | ⬜ not started |

**Phase 0 is not complete.** No measurement has been taken on physical hardware,
so no model choice is settled. See BENCHMARKS.md and ROADMAP.md.
