# BeatN — The Plan

One document. Four stages. Plain words.

> **Where you are now:** Stage 1 is nearly done, Stage 2 is built but unproven,
> Stage 3 has started, Stage 4 hasn't.
>
> ```
> 1. PROVE IT WORKS   ████████░░   one 10-minute session left
> 2. BUILD THE APP    ██████████   built — but never run on a phone
> 3. MAKE IT SAFE     ██░░░░░░░░
> 4. SHIP IT          ░░░░░░░░░░
> ```

---

## Stage 1 — Prove it works

*Can this phone record, understand and reflect, fast enough to be worth using?*

| | Task | Status |
| --- | --- | --- |
| 1.1 | Get the app onto a real iPhone | ✅ done |
| 1.2 | Recording and transcription work on device | ✅ confirmed |
| 1.3 | **Record once and write down the numbers** | ⬜ **you** |
| 1.4 | Pick the model those numbers justify | ⬜ me, from 1.3 |

**How to do 1.3:** build, open the app, long-press "Journal" → Developer →
record about 30 seconds → copy the results block into
[BENCHMARKS.md](../BENCHMARKS.md).

**What the numbers mean** (full rules in BENCHMARKS.md):

- **Speed factor under 1.0** — transcription is faster than real time. Over 1.0
  and the speech model is too big.
- **Wait before first words under 4 seconds** — longer and reflections cannot
  happen while you watch.
- **JSON attempts = 1** — the reflection came out right first time. If it says
  2, the language model is too weak.

**Why it blocks everything:** the model choice decides how fast the app feels,
how much storage it needs, and which phones can run it.

---

## Stage 2 — Build the app

*The smallest thing a real person could use.*

| | Task | Status |
| --- | --- | --- |
| 2.1 | Look and feel — colours, type, buttons | ✅ built |
| 2.2 | First-run download — one button, no choices | ✅ built |
| 2.3 | Saving entries — database that survives restarts | ✅ built |
| 2.4 | Background processing — recordings process while you carry on | ✅ built |
| 2.5 | Home · Record · Entry screens | ✅ built |
| 2.6 | Developer tools — hidden, for benchmarking | ✅ built |

⚠️ **All of this is built and none of it has run on a phone.** Six pieces are
stacked up unverified. The first real run either confirms them or finds
something fundamental.

---

## Stage 3 — Make it safe

*Things that do not matter in a demo and matter enormously in a real app.*

| | Task | Status | Why |
| --- | --- | --- | --- |
| 3.1 | Catch mistakes automatically (linting) | ✅ done | Found 5 real bugs immediately |
| 3.2 | Long recordings don't eat memory | ✅ done | A 10-minute entry used to risk a crash |
| 3.3 | **Lock the journal** — encryption + Face ID | ⬜ | **Anyone holding your unlocked phone can read everything today** |
| 3.4 | Stop audio files piling up forever | ⬜ | About 1.1 GB a year, nothing deletes it |
| 3.5 | Verify downloads aren't corrupt | ⬜ | A damaged model currently loads as if fine |
| 3.6 | Pick the right model for weaker phones | ⬜ | Every phone gets the big model today |
| 3.7 | Actually test the database queries | ⬜ | No test runs real SQL — the riskiest untested code |
| 3.8 | Crash reports (without leaking content) | ⬜ | You cannot fix what you cannot see |

**3.3 is the one I would not ship without.** The whole product promise is
privacy, and the journal is currently a plain unencrypted file. It also has to
be done *before* people have data, because turning encryption on changes the
file format.

**3.4 needs a decision from you:** keep audio forever so entries can be played
back, or delete it after some time?

---

## Stage 4 — Ship it

*Getting onto the App Store and Google Play.*

### Apple

| | Task | Status |
| --- | --- | --- |
| 4.1 | Developer account | ✅ you have it |
| 4.2 | App record in App Store Connect | ⬜ |
| 4.3 | Privacy questions, screenshots, description | ⬜ |
| 4.4 | TestFlight round | ⬜ |
| 4.5 | Submit for review | ⬜ |

### Google — ⚠️ start this early

| | Task | Status |
| --- | --- | --- |
| 4.6 | **Play Console account ($25)** | ⬜ **start now** |
| 4.7 | **Identity verification** — ID, address, phone | ⬜ takes days |
| 4.8 | **12 testers for 14 days in a row** | ⬜ **14 days of waiting** |
| 4.9 | Target Android 16 — required since 31 Aug 2026 | ⬜ needs checking |
| 4.10 | Data safety form, listing, screenshots | ⬜ |

**4.8 is the thing that will delay you.** Google will not let a new personal
account publish until twelve real people have been in a closed test for
fourteen consecutive days. That is calendar time you cannot compress.

**A company account skips 4.8 entirely.** Worth deciding before you register.

### Both stores

- A published privacy policy
- No medical or diagnostic language anywhere — BeatN describes mood, it does
  not diagnose. This is the most likely reason a reviewer pushes back.

---

## What to do next

1. **Build and use the app for ten minutes.** Gets you Stage 1 finished and
   tells you whether Stage 2 works.
   ```sh
   npx eas-cli@latest build --profile development --platform ios
   ```
2. **Start the Google Play account.** Pure waiting time — begin it now and it
   runs in the background.
3. Then I carry on with Stage 3, starting with locking the journal.

---

## Not now

Search, asking questions of your journal, insights, notifications, syncing
between devices, accounts and payments. All parked in [IDEAS.md](IDEAS.md).

## Other documents

| | |
| --- | --- |
| [RUNNING.md](RUNNING.md) | How to build and test it |
| [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) | How it is put together, and why |
| [../BENCHMARKS.md](../BENCHMARKS.md) | Speed measurements and what they mean |
| [IDEAS.md](IDEAS.md) | Parked ideas |
| [../DEVELOPMENT.md](../DEVELOPMENT.md) | Toolchain quirks (the exFAT problems) |
