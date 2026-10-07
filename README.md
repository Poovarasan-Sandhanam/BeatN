# BeatN

**Capture your thoughts. Understand your days.**

A private, voice-first AI journal. Speak → transcribe → understand → remember →
ask. Transcription and reflection run on the device; the only network traffic is
downloading AI models.

BeatN is a journaling and reflection app. It is not a therapist, a medical
device, or a diagnostic tool.

## Current state: Phase 0 — feasibility spike

The repository holds a single screen that exercises the whole risky path end to
end, plus the abstractions the rest of the app will sit on. **No journal, no
database, no navigation yet** — those start at Phase 1, and only once the spike
has produced real-device numbers.

```
record 16 kHz mono PCM  →  WAV  →  whisper.cpp  →  transcript
                                                       ↓
                        validated JSON  ←  Zod  ←  llama.cpp
                     (summary · mood · topics)
```

### What is verified

- Expo SDK 57 / React Native 0.86.3, TypeScript strict, `tsc --noEmit` clean.
- `npm test` green: 106 tests across 8 suites, no device required.
- `expo prebuild` generates both native projects; `whisper-rn`, `llama-rn` and
  `ExpoAudio` all link.
- `whisper-rn` and `llama-rn` compile and link for **arm64 iphoneos**.

### What is not verified

- **No measurements on physical hardware yet.** No iPhone or Android phone was
  reachable from this machine. See [BENCHMARKS.md](BENCHMARKS.md) for what to
  run and what the numbers have to beat.
- Model selection is therefore still open.

## Getting started

```sh
nvm use          # Node 20.19.4 — see DEVELOPMENT.md
npm install
npm run prebuild
npm run ios      # or npm run android
```

Expo Go will not work: `whisper.rn`, `llama.rn` and `expo-audio`'s PCM stream
are native modules, so a development build is required.

In the app, download one speech model and one language model, then record.

## Layout

```
src/domain/         pure domain model — no React, no Expo, no SQL
src/core/ai/        engine ports, InferenceArbiter, ModelResidencyManager
src/core/audio/     PCM capture → 16 kHz mono WAV
src/core/stt/       SpeechToTextEngine  ← WhisperEngine
src/core/llm/       LocalLLMEngine      ← LlamaEngine, Zod analysis schema
src/core/models/    ModelManager, model catalog
src/core/platform/  platform adapters (the only place expo-crypto is imported)
src/core/bench/     benchmark record and formatting
src/spike/          the Phase 0 screen
scripts/            exFAT AppleDouble cleanup (see DEVELOPMENT.md)
```

## Documentation

| | |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layering, the capture pipeline, and why it does not use `useAudioRecorder`. |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Toolchain versions, the exFAT workaround, library workarounds. |
| [BENCHMARKS.md](BENCHMARKS.md) | What the spike measures, how to measure it, and the thresholds that decide the models. |
| [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) | **The target architecture end to end** — layers, domain model, data core, AI pipeline, RAG, sync, privacy. |
| [docs/RUNNING.md](docs/RUNNING.md) | **How to actually run it** — ordered manual steps, device setup, and troubleshooting. |
| [docs/LAUNCH.md](docs/LAUNCH.md) | **Road to launch** — what is done, what is left, and every App Store / Play Store requirement. |
| [docs/BACKLOG.md](docs/BACKLOG.md) | **Everything outstanding** — what needs you, what is next to build, open defects. |
| [docs/ROADMAP.md](docs/ROADMAP.md) | **Every build step, phase by phase** — what to learn, what ships, and the exit criteria for each. |
