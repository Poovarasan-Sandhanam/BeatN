# Ideas — parked, not built

Anything on the **Later** list goes here instead of into the codebase. Nothing in
this file is a commitment, and nothing here is started without an explicit go-ahead.

Detailed design thinking for several of these already exists in
[SYSTEM_DESIGN.md](SYSTEM_DESIGN.md). That document describes a **target**
architecture — it is design, not built code. Treat it as reference material for
when an item below is unparked.

---

## Parked

| Idea | Why it's interesting | Where the thinking lives |
| --- | --- | --- |
| Search (FTS5 lexical) | Finding an entry by a remembered word | SYSTEM_DESIGN §4 |
| Semantic search (embeddings + sqlite-vec) | Finding an entry by meaning when the word is forgotten | SYSTEM_DESIGN §4, §6 — **iOS blocker: `vec.xcframework` is not shipped in expo-sqlite 57.0.3** |
| Ask Journal / RAG | The feature that makes BeatN more than a notes app | SYSTEM_DESIGN §5, §6 |
| Separate `Memory` entity | Cross-time reasoning: "what was I thinking when…" | SYSTEM_DESIGN §3 · code parked at `src/domain/memory/` |
| Evidence and confidence banding | Stops the model inventing a life the user didn't live | SYSTEM_DESIGN §3 |
| Insights and trends | Mood and topic patterns over weeks | SYSTEM_DESIGN — not detailed |
| Notifications | Gentle resurfacing of past entries | — |
| Sync across devices | Oplog, hybrid logical clocks, per-field last-writer-wins | SYSTEM_DESIGN §11 |
| Backend, accounts, payments | Cloud companion that core features never depend on | SYSTEM_DESIGN §11 |
| Cloud AI (opt-in per action) | Larger models for hard questions | SYSTEM_DESIGN §10 |
| Multiple reasoning models | Fast capture model vs deep reflection model | SYSTEM_DESIGN §7 |

---

## Observations worth keeping

**Grammar-constrained JSON.** `llama.rn` accepts a `json_schema` on completion
and compiles it to a GBNF grammar, so malformed JSON becomes impossible at the
sampler rather than something to detect and retry. Verified in the installed
`llama.rn` 0.12.9 type definitions. Relevant when extraction reliability becomes
a problem — see the decision rules in [BENCHMARKS.md](../BENCHMARKS.md).

**Reranking is available.** `context.rerank(query, documents)` exists in the same
package, which would give two-stage retrieval if and when search is built.

**`src/domain/memory/Memory.ts` is parked, not live.** It was written before
Memory was placed on the Later list. It is pure TypeScript, unit-tested, and
imported by nothing, so it carries no runtime cost. Decision: leave it in place
rather than delete and rewrite it. Do not wire it into anything.

**Model residency will need managing.** A phone cannot hold Whisper, a 1.5B
generation model and an embedding model in RAM simultaneously. `src/core/ai/`
already contains an `InferenceArbiter` and a `ModelResidencyManager` for this.
Both are pure TypeScript and unit-tested; neither is wired into the app yet.
