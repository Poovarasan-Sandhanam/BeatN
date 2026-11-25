# App Store listing — BeatN 1.0

Copy each field into App Store Connect → BeatN. Character limits are Apple's;
the counts beside each field were checked.

## URLs

| Field | Value |
| --- | --- |
| Privacy Policy URL | https://poovarasan-sandhanam.github.io/BeatN/privacy.html |
| Support URL | https://poovarasan-sandhanam.github.io/BeatN/support.html |
| Marketing URL (optional) | https://poovarasan-sandhanam.github.io/BeatN/ |

The pages publish from `site/` once the support address is filled in (see
`.github/workflows/pages.yml`).

## Name and subtitle

| Field | Value | Length |
| --- | --- | --- |
| Name (30) | BeatN | 5 |
| Subtitle (30) | Private, offline voice journal | 30 |

## Promotional text (170)

Talk for a minute. BeatN writes it down, notices how you sounded and reflects it back — entirely on your iPhone. Nothing you say ever leaves it.

## Description (4000)

BeatN is a voice journal that keeps everything on your iPhone.

Talk for a minute about your day. BeatN writes down what you said, picks up how you sounded, and gives you a short reflection — all on the device, without an account and without sending a word anywhere.

JUST TALK
• Tap the microphone and speak — no typing, no blank page.
• Pause when you need to and pick up where you left off.
• A gentle prompt is there if you're not sure where to start.

UNDERSTOOD ON YOUR PHONE
• Your words become a transcript and a short reflection, written to you.
• See the mood of each entry, and the energy in your voice.
• One small, practical idea to try today, drawn from what you said.

SEE YOUR PATTERNS
• Look back over the last few days, a week, a month or three — or pick any days you like.
• See how your days have felt over time, which topics come with brighter or heavier days, and which days of the week tend to go best.
• Ask for a reflection on any stretch of time, with a few small things to try.

PRIVATE BY DESIGN
• Everything is made and stored on your iPhone. No account, no cloud, no tracking, no ads.
• Your journal is encrypted and opens only with Face ID or your passcode.
• It hides itself in the app switcher, and its files can't be read while your phone is locked.

GOOD TO KNOW
• The first launch downloads BeatN's speech and language models once (about 1.2 GB). Wi-Fi is best. After that, BeatN works offline.
• Reflections and moods are generated automatically and can be wrong. BeatN is a journal, not a therapist, and does not give medical advice.

## Keywords (100)

```
journal,diary,voice,mood,reflection,private,offline,gratitude,mindset,audio,daily,notes,self care
```

97 characters. Comma-separated with no spaces, as Apple counts them. The app
name is indexed already, so it is not repeated here.

## Category

| | |
| --- | --- |
| Primary | Lifestyle |
| Secondary | Productivity |

Health & Fitness is avoided on purpose: it invites closer review of health
claims, and BeatN makes none.

## Age rating

Answer **None / No** to every content question, including *Medical/Treatment
Information*. Result: **4+**. (BeatN gives no medical information; its
reflections say so.)

## App Privacy

**Data Not Collected.** Nothing leaves the device: no account, no analytics,
no crash reporting, no ads. Recordings, transcripts, moods and voice
measurements are processed and stored only on the phone. The one network use
is downloading the models from Hugging Face, which sends no user data.

## Export compliance (encryption)

BeatN encrypts the journal on the device (SQLCipher, AES) and uses the iOS
keychain and HTTPS. App Store Connect asks about this for every build.

- *Does your app use encryption?* — **Yes.**
- Encryption used only to protect the user's own data on the device is
  generally treated as **exempt**; if App Store Connect's questions confirm
  BeatN qualifies for an exemption, keep `ITSAppUsesNonExemptEncryption: false`
  in `app.json` (it declares *non-exempt* encryption only), and the question
  stops being asked per build.
- If the questions show it does **not** qualify, set the key to `true` and
  follow Apple's documentation-upload steps.

Verify the answers against App Store Connect's encryption questions and
Apple's export-compliance documentation; this note is guidance, not legal
advice.

## App Review information

**Sign-in required:** No.

**Notes for the reviewer:**

> Thank you for reviewing BeatN, a private voice journal that runs entirely on the device.
>
> 1. FIRST LAUNCH DOWNLOADS THE MODELS: BeatN transcribes and reflects on-device, so on first launch it downloads its speech and language models once (about 1.2 GB) from Hugging Face. Please use Wi-Fi and allow a few minutes. The download is integrity-checked before use. After that, the app works offline.
> 2. NO ACCOUNT: there is no sign-in and nothing is uploaded.
> 3. FACE ID / PASSCODE: after the download, the journal opens with Face ID or the device passcode, and locks again after 30 seconds in the background.
> 4. TO TRY IT: tap "New entry", allow the microphone, speak for 20–30 seconds, then tap the stop button. The entry is transcribed and reflected on in the background (up to about a minute on older devices); open it to see the transcript, mood, "How you are" and a suggestion. "Your patterns" on the home screen shows insights across days.
> 5. REFLECTIONS ARE NOT ADVICE: moods and reflections are generated on the device and labelled as such; BeatN is a journal, not a therapist.

**Contact:** your name, phone and the support email.

## Price

Free, all territories (Pricing and Availability). A paid price additionally
needs Apple's Paid Apps agreement, tax and banking details.
