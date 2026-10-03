This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx tsc --noEmit            # typecheck  (npm run typecheck)
npx jest                    # tests      (npm test)
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run **typecheck and tests** before declaring any task done. Both must be clean.

ESLint is not configured in this project yet, so `npx expo lint` does not work —
do not cite it as a verification step.

## Architecture

Read [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) before making structural
changes, and [docs/ROADMAP.md](docs/ROADMAP.md) to see which phase the work
belongs to.

The dependency rule is enforced by `src/__tests__/architecture.test.ts` and is
not negotiable:

- `src/domain/` is pure TypeScript — no React, no Expo, no SQL, no AI library.
- No UI file imports `llama.rn`, `whisper.rn` or `expo-sqlite`. Screens call
  services; services call ports.
- All inference goes through `InferenceArbiter`. Never call an engine directly —
  one GPU, finite RAM.
- Nothing under `src/core/` or `src/domain/` may `console.log`. Transcripts,
  prompts and model output must never reach a log sink.

## Navigation & Routing

Navigation is **not yet set up** — the app currently renders a single spike
screen from `App.tsx`. Expo Router arrives with the real UI (ROADMAP Phase 2).
When it does:

- Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files
  define navigators. Keep non-route code outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
