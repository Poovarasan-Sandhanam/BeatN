/**
 * The infrastructure adapter for `RandomSource`.
 *
 * This is the only place expo-crypto is imported. Domain code takes the port
 * (`RandomSource`) as a parameter, which is what keeps `src/domain/` free of
 * platform dependencies and testable with a deterministic stub.
 *
 * Expo's "winter" runtime does not install a global `crypto`, so
 * `globalThis.crypto.getRandomValues` is not available on device.
 */
import { getRandomBytes } from 'expo-crypto';

import type { RandomSource } from '../../domain/shared/ids';

export const cryptoRandomSource: RandomSource = (byteLength) => getRandomBytes(byteLength);
