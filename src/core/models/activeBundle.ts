/**
 * The model bundle this phone should use, decided once from its RAM.
 *
 * The only place expo-device is read for model choice. Everything that asks
 * "which models?" — first-run download, model resolution for jobs — goes
 * through here, so a 3 GB iPhone never downloads a model it cannot hold.
 */
import * as Device from 'expo-device';

import { deviceClassForMemory, recommendedBundle, type ModelBundle } from './bundles';

let cached: ModelBundle | null = null;

export function activeBundle(): ModelBundle {
  if (!cached) cached = recommendedBundle(deviceClassForMemory(Device.totalMemory));
  return cached;
}
