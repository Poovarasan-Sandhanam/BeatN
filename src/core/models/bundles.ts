/**
 * Model bundles.
 *
 * A user should never choose a speech model and a language model. They should
 * not have to know those are separate things, or what "Q4_K_M" means. They
 * choose nothing: BeatN picks a bundle for the device and asks once for a
 * single download.
 *
 * The individual models stay addressable (see `catalog.ts`) because Step 1
 * has to benchmark each combination, and the developer screen needs an
 * override. That override is the exception, not the default path.
 */

import { getModelSpec, type DeviceClass } from './catalog';

export type BundleId = 'light' | 'standard';

export interface ModelBundle {
  id: BundleId;
  label: string;
  /** One sentence a non-technical user actually reads. */
  description: string;
  sttModelId: string;
  llmModelId: string;
  minDeviceClass: DeviceClass;
}

export const MODEL_BUNDLES: readonly ModelBundle[] = [
  {
    id: 'light',
    label: 'Light',
    description: 'Smaller download, faster on older phones.',
    sttModelId: 'whisper-tiny-en-q5_1',
    llmModelId: 'qwen2.5-0.5b-instruct-q4_k_m',
    minDeviceClass: 'low',
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Better punctuation and more considered reflections.',
    sttModelId: 'whisper-base-en-q5_1',
    llmModelId: 'qwen2.5-1.5b-instruct-q4_k_m',
    minDeviceClass: 'mid',
  },
];

/**
 * The bundle when the device cannot be measured, and the developer screen's
 * starting point. Real devices use `activeBundle()` (activeBundle.ts).
 *
 * PROVISIONAL. Which bundle is the default is the output of Step 1 — it must
 * come from real-device benchmarks, not from a guess. See BENCHMARKS.md.
 * Changing this one constant is how that decision gets applied.
 */
export const DEFAULT_BUNDLE_ID: BundleId = 'standard';

export function getBundle(id: BundleId): ModelBundle {
  const bundle = MODEL_BUNDLES.find((candidate) => candidate.id === id);
  if (!bundle) throw new Error(`UNKNOWN_BUNDLE:${id}`);
  return bundle;
}

/** Download order: speech first, so transcription can start sooner. */
export function bundleModelIds(bundle: ModelBundle): string[] {
  return [bundle.sttModelId, bundle.llmModelId];
}

export function bundleBytes(bundle: ModelBundle): number {
  return bundleModelIds(bundle).reduce((total, id) => total + getModelSpec(id).approxBytes, 0);
}

const CLASS_RANK: Record<DeviceClass, number> = { low: 0, mid: 1, high: 2 };

const GB = 1024 ** 3;

/**
 * A device's class from its RAM. The 1.1 GB language model needs room: iOS
 * lets one app use only part of the phone's memory, and on 3 GB iPhones
 * (iPhone 8 Plus, X, XS, XR, 11 Pro era) that is too little to hold it
 * safely. Thresholds sit between real RAM sizes (3, 4, 6, 8 GB), so a
 * phone never lands on the boundary.
 *
 * Unknown memory gets `mid`: every phone that can install BeatN and fails
 * to report its RAM is still treated as an ordinary phone, not a weak one.
 */
export function deviceClassForMemory(totalMemoryBytes: number | null): DeviceClass {
  if (totalMemoryBytes === null || !Number.isFinite(totalMemoryBytes) || totalMemoryBytes <= 0) return 'mid';
  if (totalMemoryBytes < 3.5 * GB) return 'low';
  if (totalMemoryBytes < 7 * GB) return 'mid';
  return 'high';
}

/** The largest bundle the device can reasonably run. */
export function recommendedBundle(deviceClass: DeviceClass): ModelBundle {
  const affordable = MODEL_BUNDLES.filter(
    (bundle) => CLASS_RANK[bundle.minDeviceClass] <= CLASS_RANK[deviceClass],
  );
  const best = affordable[affordable.length - 1];
  // `light` is `low`, so there is always at least one affordable bundle.
  return best ?? getBundle('light');
}
