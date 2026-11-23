/**
 * The iOS/Android audio session, set explicitly for each job.
 *
 * Left alone, iOS does two things that make playback seem broken:
 *   - with the ring/silent switch on silent, app audio is muted unless the app
 *     opts in to playing anyway;
 *   - after recording, the session stays in record mode, which routes
 *     playback to the earpiece — so quiet it sounds like nothing played.
 * A journal you listen back to needs neither.
 */
import { setAudioModeAsync } from 'expo-audio';

/** Best effort: a session that cannot be configured must not block the user. */
async function apply(mode: Parameters<typeof setAudioModeAsync>[0]): Promise<void> {
  try {
    await setAudioModeAsync(mode);
  } catch {
    // Keep whatever session the OS has; recording or playback still runs.
  }
}

/** Microphone on; nothing else playing over the recording. */
export function prepareForRecording(): Promise<void> {
  return apply({
    allowsRecording: true,
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: false,
    interruptionMode: 'doNotMix',
  });
}

/** Microphone off, loudspeaker, audible even with the silent switch on. */
export function prepareForPlayback(): Promise<void> {
  return apply({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: false,
  });
}
