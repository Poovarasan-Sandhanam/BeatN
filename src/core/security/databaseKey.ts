/**
 * The journal's encryption key: 256 random bits, created on first launch and
 * kept in the iOS Keychain / Android Keystore. Never derived from anything the
 * user types, never written to disk in the clear, never logged.
 *
 * The only place expo-secure-store is imported for the database key.
 */
import * as SecureStore from 'expo-secure-store';

import type { RandomSource } from '../../domain/ids';
import { cryptoRandomSource } from '../platform';

const KEY_NAME = 'beatn.database-key.v1';

/**
 * Default accessibility (`WHEN_UNLOCKED`), deliberately not `THIS_DEVICE_ONLY`.
 * The encrypted journal is included in device backups; a key that could not
 * travel with it would turn every phone upgrade into a lost journal.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED,
};

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** True for a 256-bit key in hex — anything else is not a key this app wrote. */
export function isValidKeyHex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/** Returns the stored key, creating and storing one on first use. Hex, 64 chars. */
export async function getOrCreateDatabaseKey(
  random: RandomSource = cryptoRandomSource,
): Promise<{ key: string; created: boolean }> {
  const existing = await SecureStore.getItemAsync(KEY_NAME, OPTIONS);
  if (existing && isValidKeyHex(existing)) return { key: existing, created: false };

  const key = toHex(random(32));
  await SecureStore.setItemAsync(KEY_NAME, key, OPTIONS);
  return { key, created: true };
}
