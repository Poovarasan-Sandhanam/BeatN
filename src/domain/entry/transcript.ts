/**
 * Whisper marks non-speech with bracketed tags — `[BLANK_AUDIO]`, `[MUSIC]`,
 * `(silence)`, `[ Inaudible ]` — and the exact spelling varies by model and
 * language. None of it is something the user said, so none of it belongs in
 * their journal or in the prompt that summarises it.
 */
const NON_SPEECH_TAG = /[[(]\s*[A-Za-z_][A-Za-z_ \-]*\s*[\])]/g;

/** Words Whisper uses inside those tags. A tag is only removed if it names one. */
const NON_SPEECH_WORDS =
  /^(blank[_ ]?audio|silence|music|music playing|inaudible|noise|background noise|applause|laughter|laughs|cough|coughs|sigh|sighs|breathing|wind|static|no speech|pause|clears throat|beep|beeping|ringing)$/i;

/**
 * The transcript as the user should see it: non-speech tags removed and
 * whitespace collapsed. Empty when the recording held no speech at all.
 */
export function cleanTranscript(raw: string): string {
  return raw
    .replace(NON_SPEECH_TAG, (tag) => {
      const inner = tag.slice(1, -1).trim();
      return NON_SPEECH_WORDS.test(inner) ? ' ' : tag;
    })
    .replace(/\s+/g, ' ')
    .trim();
}
