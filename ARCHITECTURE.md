# Architecture

This document records the boundaries that **already hold in the code today**.

For the architecture BeatN is being built *towards* — the four layers, the
domain model, the AI pipeline, retrieval, sync and the privacy model — see
[docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md). The phase-by-phase path from
here to there, with exit criteria, is [docs/ROADMAP.md](docs/ROADMAP.md).

## Layering

```
UI (src/spike, later src/features + src/app)
        │  depends only on the interfaces below
        ▼
Engines          SpeechToTextEngine        LocalLLMEngine
                       │                        │
                 WhisperEngine             LlamaEngine
                  (whisper.rn)              (llama.rn)
        │
        ▼
ModelManager     download · verify · storage · removal
        │
        ▼
expo-file-system
```

No UI file imports `whisper.rn` or `llama.rn`. Swapping the runtime or the model
means adding a class behind the existing interface.

## Capture pipeline

```
expo-audio useAudioStream        16 kHz · mono · int16 PCM
        ▼
downmix → resample (only if the device refused the requested format)
        ▼
RIFF/WAVE encode                 src/core/audio/pcm.ts
        ▼
file:// …/recordings/<ts>.wav
        ▼
WhisperEngine.transcribe         → transcript
        ▼
LlamaEngine.generateStructured   → JSON → Zod → EntryAnalysis
```

### Why not `useAudioRecorder`

`whisper.rn` does not decode compressed audio — its `transcribe()` accepts WAV
containing 16-bit PCM and nothing else. `expo-audio`'s recorder presets can
produce LinearPCM on iOS, but on Android `AndroidOutputFormat` offers only
`3gp | mpeg4 | amrnb | amrwb | aac_adts | mpeg2ts | webm` and
`AndroidAudioEncoder` offers no PCM encoder at all, so there is no way to get a
WAV out of the recorder on Android.

`useAudioStream` (expo-audio 57, natively implemented in both
`ios/AudioStream.swift` and `android/.../AudioStream.kt`) delivers raw PCM
buffers at a requested sample rate, channel count and encoding. One capture path
serves both platforms, and the same buffers drive the recording waveform.

One caveat is handled in code: if `AVAudioConverter` cannot be constructed, the
iOS implementation silently falls back to the hardware format. Each
`AudioStreamBuffer` carries its own `sampleRate` and `channels`, so
`toWhisperPcm()` normalises per buffer rather than trusting what was requested.

## Structured AI output

`LocalLLMEngine.generateStructured()` takes a validator rather than a schema
object, keeping Zod in the feature layer. It parses, validates, and on failure
retries once at temperature 0 with a blunter instruction before throwing
`AI_STRUCTURED_OUTPUT_INVALID`. `extractJsonObject()` pulls the outermost
balanced `{...}` out of the reply, because small quantized models routinely wrap
JSON in prose or a markdown fence.

## Models are downloaded, never bundled

`ModelManager` owns the on-disk location, a storage-headroom check, download
with progress, a size-based completeness check (a file under 95% of the expected
size counts as absent, so a killed download is not loaded as a corrupt model),
and removal. Engines receive a path and nothing else.

## Privacy boundaries already in force

- Logs use event names only — `RECORDING_STARTED`, `TRANSCRIPTION_COMPLETED`,
  `ENTRY_PROCESSING_COMPLETED`. No transcript, audio or prompt text is logged.
- Errors surface through `describeError()`, which maps internal codes
  (`MICROPHONE_PERMISSION_DENIED`, `MODEL_DOWNLOAD_FAILED`,
  `AI_STRUCTURED_OUTPUT_INVALID`, …) to plain language.
- Nothing leaves the device. The only network calls are model downloads.

## Phase 1 foundations now in place

These are pure TypeScript, unit-tested without a device:

- **`src/domain/`** — `JournalEntry` with its persisted processing state
  machine, `Memory` with evidence and confidence banding, and UUIDv7. Imports
  nothing from React, Expo or SQLite; `src/__tests__/architecture.test.ts`
  fails the build if that changes.
- **`src/core/ai/engines/types.ts`** — the four engine ports: speech-to-text,
  text generation (with grammar-constrained structured output), embedding and
  rerank.
- **`src/core/ai/ModelResidencyManager.ts`** — an LRU over a RAM budget with
  pinning. A phone cannot hold Whisper, a 1.5B model and an embedder at once,
  so residency is managed rather than assumed.
- **`src/core/ai/InferenceArbiter.ts`** — serializes all inference by priority,
  so a background embedding job cannot preempt the Ask the user is watching.

## Not yet built

The SQLite schema and migrations, FTS5 + sqlite-vec retrieval, the processing
queue, memory extraction, RAG, Expo Router navigation, the design system,
notifications, biometric lock, encryption at rest and sync. See
[docs/ROADMAP.md](docs/ROADMAP.md).

`expo-sqlite` is installed and its config plugin is configured for FTS5 and
sqlite-vec, but **this needs `npm run prebuild` to take effect natively.**
