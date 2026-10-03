# Benchmarks

Phase 0 exists to replace guesses with measurements. Nothing here is filled in
from specifications — a row is added only after the spike screen produced it on
the device named.

## Status

**No real-device measurements have been taken yet.** Neither a physical iPhone
nor a physical Android device was reachable from this machine during the spike:

- The paired iPhone 14 (`iPhone14,7`) shows `transportType: localNetwork` with
  `tunnelState: disconnected`, last connected 2026-09-27 20:03 UTC. It does not
  appear in `xcodebuild -showdestinations`.
- `adb devices` lists nothing. The only Android target available is the
  `Pixel_9` emulator (android-36).

Until those numbers exist, **no model choice in `src/core/models/catalog.ts` is
settled**, and Phase 1 should not start. See "How to take a measurement" below.

## What the spike measures

The spike screen reports each of these after one record → transcribe → analyse
run, and `formatBenchmark()` prints them as a copy-pasteable block.

| Metric | Why it matters |
| --- | --- |
| STT model load (ms) | Paid once per app session; a slow load shows up as first-use latency. |
| STT processing (ms) | Wall clock inside `WhisperEngine.transcribe()`. |
| **STT real-time factor** | `processing / audio duration`. **Below 1.0 or the model is unusable.** |
| STT GPU / Core ML | Whether whisper.cpp got an accelerated backend, and the reason if not. |
| LLM model load (ms) | Dominated by reading a ~400 MB–1.1 GB GGUF off storage. |
| LLM time to first token (ms) | What the user actually feels while waiting for a reflection. |
| LLM tokens/sec | From llama.cpp's own `timings.predicted_per_second`. |
| **JSON attempts** | 1 = the model produced valid JSON first try. Routinely 2 means the model is too weak for structured output. |
| Captured sample rate / channels | Confirms the device honoured 16 kHz mono rather than falling back. |

Peak memory is **not** captured yet. `llama.rn` exposes no memory counter, and
adding a native one was out of scope for the spike. Read it from Xcode
Instruments or Android Studio Profiler during a run and record it by hand.

## How to take a measurement

### iPhone

1. Connect the iPhone over **USB**, unlock it, and trust the Mac.
2. Enable **Settings → Privacy & Security → Developer Mode**.
3. Make sure `app.json` sets `ios.appleTeamId` to a team your registered Apple
   ID can use. The earlier `No Account for Team "HJDB7FS8R4"` failure was *not*
   a missing account — an Apple ID is registered, but it only has access to
   team `6J75KC7K4S`, while the project was pinned to `HJDB7FS8R4` (a stale
   certificate in the keychain from a different team). List the usable teams
   with `defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier`.
4. ```sh
   npx expo run:ios --device
   ```

   Note the `--`: `npm run ios --device` sets an npm config variable instead of
   passing the flag to Expo. Use `npm run ios -- --device` or the `npx` form
   above.

### Android

1. Connect a physical device with USB debugging enabled, confirm `adb devices`
   lists it.
2. ```sh
   npm run android
   ```

### Then

In the app: download one STT and one LLM model, record roughly 30 seconds of
ordinary speech, and copy the benchmark block into the table below.

## Results

| Device | OS | STT model | Audio | STT time | RTF | LLM model | Load | TTFT | tok/s | JSON tries |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| _(none yet)_ | | | | | | | | | | |

## Decision rules

Apply these to the table before writing any Phase 1 code:

- **RTF ≥ 1.0** — drop to the next smaller Whisper model. `whisper-base-en-q5_1`
  is only the default candidate, not a decision.
- **Time to first token > ~4 s** — the reflection cannot be generated inline;
  either move to a smaller LLM or make the entry visible before analysis
  finishes (which the pipeline already allows for).
- **JSON attempts routinely 2** — the model is too weak for structured output at
  this quantisation. Try the larger model, or move mood and topics to a
  constrained grammar rather than free JSON.
- **LLM load > ~10 s** — keep the context alive across entries rather than
  loading per request.
