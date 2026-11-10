/**
 * Device owner authentication — Face ID, Touch ID, fingerprint, or the device
 * passcode as the fallback. The only place expo-local-authentication is used.
 */
import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Whether the device can prove its owner at all. A phone with no passcode
 * cannot be locked meaningfully, so the app does not pretend to.
 */
export async function canAuthenticate(): Promise<boolean> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

export type AuthOutcome = 'success' | 'cancelled' | 'failed' | 'unavailable';

export async function authenticate(): Promise<AuthOutcome> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock your journal',
      cancelLabel: 'Cancel',
      // Passcode fallback stays on: a failed Face ID must not lock someone
      // out of their own journal.
      disableDeviceFallback: false,
    });
    if (result.success) return 'success';
    switch (result.error) {
      case 'user_cancel':
      case 'app_cancel':
      case 'system_cancel':
        return 'cancelled';
      case 'not_enrolled':
      case 'not_available':
      case 'passcode_not_set':
        return 'unavailable';
      default:
        return 'failed';
    }
  } catch {
    return 'failed';
  }
}
