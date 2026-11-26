# Google Play listing — BeatN 1.0

The Play Console version of `listing.md`. Text fields reuse the App Store
copy where Play allows; Play-only forms are answered below.

## Before anything: the account

1. Create a **Play Console** account ($25 one-off) at https://play.google.com/console.
2. Complete **identity verification** (ID, address, phone) — takes days.
3. **Personal accounts** must run a **closed test with at least 12 testers for
   14 days in a row** before production access. Organisation accounts (D-U-N-S
   number) skip this.

## Create the app

| Field | Value |
| --- | --- |
| App name | BeatN |
| Default language | English (United Kingdom) — or United States |
| App or game | App |
| Free or paid | Free |
| Package name | `com.beatn.app` (set by the first upload) |

## Store listing

| Field | Limit | Value |
| --- | --- | --- |
| Short description | 80 | Private, offline voice journal. Talk; it listens, reflects — all on your phone. |
| Full description | 4000 | Use the App Store description in `listing.md` unchanged, replacing "iPhone" with "phone" and "Face ID" with "fingerprint, face unlock or screen lock". |
| App icon | 512×512 PNG | Export `assets/icon.png` at 512×512. |
| Feature graphic | 1024×500 PNG | The BeatN mark on the paper colour `#F6F3EE` with "Your thoughts, kept private." |
| Phone screenshots | 2–8 | From an Android phone or emulator, using demo entries — never a real journal. |

Short description: 79 characters.

| | |
| --- | --- |
| Category | Lifestyle |
| Contact email | poovarasanksp001@gmail.com |
| Website | https://poovarasan-sandhanam.github.io/BeatN/ |
| Privacy policy | https://poovarasan-sandhanam.github.io/BeatN/privacy.html |

## App content (Policy → App content)

**Privacy policy:** the URL above.

**Ads:** No, the app does not contain ads.

**App access:** All functionality is available without special access (no
login). Add a note: *"First launch downloads speech and language models once
(~1.2 GB, about 520 MB on low-memory phones). Wi-Fi recommended."*

**Content rating (IARC questionnaire):** category *Utility, productivity,
communication or other*. Answer **No** to violence, sexuality, language,
controlled substances, gambling, user-generated content shared with others,
and location sharing. BeatN's entries are private and never shared, so
"users can interact or exchange content" is **No**. Expected rating:
**Everyone / PEGI 3**.

**Target audience:** 18 and over (simplest; the app is a personal journal
and not designed for children). Not appealing to children.

**News app:** No. **COVID-19 apps:** No. **Government app:** No.
**Financial features:** None. **Health apps:** Not a health app — it makes no
health or medical claims.

**Data safety:**

- *Does your app collect or share any of the required user data types?* —
  **No.** Recordings, transcripts, moods and voice measurements are processed
  and stored only on the device and are never transmitted. Google's definition
  of "collect" is data transmitted off the device, which BeatN never does.
- *Is all of the user data collected by your app encrypted in transit?* —
  not applicable (nothing is collected).
- *Do you provide a way for users to request that their data is deleted?* —
  Entries can be deleted in the app, and uninstalling removes everything.
- The one network use is downloading the models from Hugging Face; no user
  data is sent.

**Permissions declared in the app:** `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`,
`USE_BIOMETRIC` (added by the biometrics module). Foreground-service
permissions are explicitly blocked in `app.json`, so no foreground-service
declaration or video is needed.

## Technical requirements (already met)

- Target **Android 16 (API 36)**; minimum Android 7 (API 24).
- **16 KB memory pages:** llama.rn's libraries are 16 KB-aligned, whisper.rn
  builds with flexible page sizes, and sqlite-vec (4 KB-aligned) is disabled.
  Confirm in the Play pre-launch report on the first upload.
- Signing: EAS created and stores BeatN's Android upload key. Enrol in
  **Play App Signing** on first upload (the default).
- `allowBackup` is off, so Android never restores the encrypted journal
  without its key.

## Releasing

**Test APK (no Play Store):** Actions → Beta release → `android-apk`, or
`npx eas-cli build --platform android --profile preview`. Install the APK from
the link on any Android phone (allow "install unknown apps" when asked).

**Play testing tracks:** the first upload to Play Console must be **manual**
(drag the `.aab` from an EAS `beta` build into *Internal testing*). After that,
create a **Google service account key** with release permissions, add it to
EAS (`npx eas-cli credentials` → Android → Google Service Account), and
Actions → Beta release → `android` uploads automatically (`internal`, or
`closed` for the 14-day test).
