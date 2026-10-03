# Development

## Requirements

| Tool | Version used | Notes |
| --- | --- | --- |
| Node | **20.19.4** | Pinned in `.nvmrc`. React Native 0.86.3 and whisper.rn require `>=20.19.4`; the machine's default 20.19.3 fails the engine check. |
| npm | 10.8.2 | Ships with Node 20.19.4. |
| Xcode | 26.3 | iOS builds. |
| CocoaPods | 1.16.2 | |
| JDK | 17 (Zulu) | Android builds. |
| Android SDK | platforms 33–36, NDK 27.1 | |

```sh
nvm use            # reads .nvmrc
npm install        # runs the AppleDouble cleanup automatically
npm run prebuild   # generates ios/ and android/, then pod install
```

## This project cannot use Expo Go

`whisper.rn`, `llama.rn` and `expo-audio`'s PCM stream are native modules, so a
development build is required:

```sh
npm run ios        # or: npm run android
npm start          # Metro, with --dev-client
```

## Working on an exFAT volume

The repository lives on an external SSD formatted **exFAT**. exFAT cannot store
extended attributes, so macOS writes a companion AppleDouble file (`._name`) next
to every file it touches. A fresh `npm install` produces roughly **27,000** of
them, and `expo prebuild` adds another ~20,000 under `ios/`.

Two native-toolchain failures come from this, both already fixed in the repo:

1. **`pod install` fails immediately.** CocoaPods globs `ios/*.podspec` and then
   evaluates `._ExpoDomWebView.podspec` as Ruby:

```text
   [!] Invalid podspec file at path `.../@expo/dom-webview/ios/._ExpoDomWebView.podspec`.
   ```

2. **`pod install` cannot find the Xcode project.** It sees both
   `BeatN.xcodeproj` and `._BeatN.xcodeproj` and refuses to guess:

```text
   [!] Could not automatically select an Xcode project.
   ```

3. **`patch-package` reports a missing package.** It reads
   `patches/._expo-modules-jsi+57.1.1.patch` as a patch for a package named
   `._expo-modules-jsi`.

4. **The Gradle build fails during configuration.** Gradle's
   `InstrumentationAnalysisTransform` walks every file in a plugin's class
   output and hands each to ASM. `._DevLauncherPlugin.class` is a 4 KB
   AppleDouble blob, not a class file, so `ClassReader` throws:

```text
   Could not isolate parameters ... of artifact transform MergeInstrumentationAnalysisTransform
     > Execution failed for InstrumentationAnalysisTransform:
       .../expo-dev-launcher-gradle-plugin/build/classes/kotlin/main
         > java.lang.IllegalArgumentException (no error message)
   ```

```text
   at org.objectweb.asm.ClassReader.<init>(ClassReader.java:263)
   at ...InstrumentationAnalysisTransform.lambda$analyzeArtifact$1
   ```

   **This one is only half-fixable.** The sidecars are written by the Kotlin
   compiler *during* the build, so a pre-build cleanup cannot prevent them —
   it only clears the ones an earlier run left behind. Run
   `npm run clean:appledouble` and build again; the second build succeeds
   because those classes are then up to date and are not rewritten. Any change
   that recompiles a Gradle plugin brings the failure back.

5. **Jest fails to parse two test suites.** Jest's default `testMatch` picks up
   `._pcm.test.ts` and `._analysis.test.ts`, which are 4 KB binary blobs, and
   hands them to Babel:

```text
   SyntaxError: .../src/core/llm/__tests__/._analysis.test.ts: Unexpected character '\x00'
   ```

   Fixed by `testPathIgnorePatterns: ["/\\._"]` in the `jest` block of
   `package.json`.

6. **`rm -rf ios/Pods` fails with `Directory not empty`.** Deleting a file on
   exFAT causes macOS to write its AppleDouble companion, so `rm` empties a
   directory and then finds a fresh `._*` sidecar in it when it tries to
   `rmdir`:

```text
   rm: ios/Pods/Headers/Public/React-Core-prebuilt: Directory not empty
   rm: ios/Pods: Directory not empty
   ```

   This is nastier than it looks: the failed `rm` returns non-zero, so an
   `rm -rf … && pod install` chain silently never runs the install. Delete in
   a loop instead:

```sh
   for i in $(seq 1 10); do
     [ -e ios/Pods ] || break
     find ios/Pods -name '._*' -delete 2>/dev/null
     rm -rf ios/Pods 2>/dev/null
   done
   ```

`scripts/strip-appledouble.js` removes them. It runs as a `postinstall` hook and
again inside `npm run prebuild` and `npm run pod:install`, and is a no-op off
macOS. Run it by hand after anything that writes a lot of files:

```sh
npm run clean:appledouble
```

Reformatting the volume as APFS would remove the problem at the source, at the
cost of Windows interoperability. Keeping the repo on the internal disk is not
currently an option — it has ~13 GB free, and models plus DerivedData need more
than that.

## Known toolchain workarounds

### Expo SDK 57 does not compile under Xcode 26.3 (patched)

`patches/expo-modules-jsi+57.1.1.patch`, applied by `patch-package` on
postinstall.

Xcode 26.3 ships Swift 6.2.4, which no longer accepts `SWIFT_RETURNS_RETAINED`
on a **constructor**. `expo-modules-jsi`'s `RuntimeScheduler.h` annotates both
of its constructors that way, so the Swift package fails to build and **every**
iOS build fails — device and simulator alike:

```text
RuntimeScheduler.h:53:26: error: 'RuntimeScheduler' cannot be annotated with
either SWIFT_RETURNS_RETAINED or SWIFT_RETURNS_UNRETAINED because it is not
returning a SWIFT_SHARED_REFERENCE type
```

The diagnostic's wording is misleading — the type *is* marked
`SWIFT_SHARED_REFERENCE`. Moving that attribute to the class head does not help;
the annotation is simply no longer valid on a constructor.

The patch removes it from the two constructors. Swift's C++ interop already
treats a `SWIFT_SHARED_REFERENCE` constructor's result as `+1`, so ownership
semantics are unchanged — which is presumably why the explicit annotation became
invalid. Verified in isolation with `swift-frontend -typecheck
-cxx-interoperability-mode=default -swift-version 6` before being applied.

Notes:

- `expo-modules-jsi` 58.0.4 ships the identical header, so upstream has not hit
  this yet. **Re-check on the next Expo release and drop the patch when it
  lands.**
- The `ExpoModulesJSI.xcframework` shipped in the package is a 16 KB stub, and
  its per-slice `.build-hash` files are empty, so the framework is always built
  from source locally. There is no prebuilt binary to fall back on.

### `whisper.rn` is imported as `whisper.rn/index`

whisper.rn 0.7.4 publishes an `exports` map with no `"."` entry:

```json
"exports": { "./*": { ... }, "./*/": { ... } }
```

Expo's TypeScript config uses `moduleResolution: "bundler"` and Metro enables
package exports, so the bare specifier `whisper.rn` does not resolve. Importing
`whisper.rn/index` matches the `"./*"` entry and works for both. Upstream fixed
this in 0.8.0-rc.1; drop the suffix when moving to a stable 0.8.x.

### `whisper.rn` types are mapped in `tsconfig.json`

The `react-native` export condition points TypeScript at whisper.rn's raw `.ts`
sources, which do not typecheck standalone (`Cannot find name 'global'`), and
`skipLibCheck` does not apply to `.ts` files. `compilerOptions.paths` maps the
import to the shipped `.d.ts` instead. Metro still resolves the real module.

## Verifying a change

```sh
npm run typecheck   # tsc --noEmit
npm test            # jest
```

> **Never pipe a native build through `tail` or `head`.** The shell reports the
> *pipeline's* exit code, which is the pager's, so a failed `pod install` reads
> as success. Redirect to a file and check `$?` instead:
> `pod install > /tmp/pod.log 2>&1; echo $?`

`tsc --noEmit` runs in strict mode with `noUnusedLocals`, `noUnusedParameters`
and `noFallthroughCasesInSwitch`.

Tests run under `jest-expo` and need no device: `src/domain/` and most of
`src/core/` are pure TypeScript by design. `src/__tests__/architecture.test.ts`
enforces the dependency rule from
[docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) — it fails the build if domain
code imports a platform library, if a screen imports an AI runtime or SQLite,
or if anything under `src/core/` or `src/domain/` logs to the console.
