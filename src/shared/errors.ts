/**
 * Maps internal error codes to plain language.
 *
 * Extracted from SpikeScreen so onboarding and future screens share one
 * vocabulary. Raw native error text is never shown to a user: it is
 * frightening, untranslatable, and occasionally leaks a file path — so in a
 * release build an unrecognised error falls back to a generic sentence.
 */

const MESSAGES: Record<string, string> = {
  MICROPHONE_PERMISSION_DENIED:
    'BeatN needs microphone access to record. You can enable it in Settings.',
  RECORDING_EMPTY: 'No audio was captured. Please try recording again.',
  MODEL_DOWNLOAD_INSUFFICIENT_STORAGE:
    'There is not enough free space on this device for the download.',
  MODEL_DOWNLOAD_FAILED:
    'The download did not finish. Check your connection and try again.',
  MODEL_DOWNLOAD_INCOMPLETE:
    'The download was cut short. Check your connection and try again.',
  MODEL_DOWNLOAD_CORRUPT:
    'The download was damaged on the way. It has been removed — please try again.',
  BUNDLE_INSTALL_CANCELLED: 'Download cancelled.',
  AI_STRUCTURED_OUTPUT_INVALID: 'The model did not return valid JSON after a retry.',
  WHISPER_MODEL_NOT_LOADED: 'The speech model is not loaded yet.',
  LLM_MODEL_NOT_LOADED: 'The language model is not loaded yet.',
};

export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const known = MESSAGES[message];
  if (known) return known;

  // The raw message helps while developing; a release build never shows it.
  return isDevelopment() ? message : GENERIC_MESSAGE;
}

export const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

/** Indirect so tests can exercise both builds. */
export function isDevelopment(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

/**
 * True when the fix is in the OS settings rather than in the app, so the UI
 * can offer a way there instead of leaving the user to find it.
 */
export function isPermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message === 'MICROPHONE_PERMISSION_DENIED';
}

export function isCancellation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message === 'BUNDLE_INSTALL_CANCELLED' || message.startsWith('INFERENCE_ABORTED');
}
