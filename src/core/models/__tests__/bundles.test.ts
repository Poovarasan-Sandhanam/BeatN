import {
  DEFAULT_BUNDLE_ID,
  MODEL_BUNDLES,
  bundleBytes,
  bundleModelIds,
  getBundle,
  recommendedBundle,
} from '../bundles';
import { getModelSpec } from '../catalog';

describe('bundles', () => {
  it('references only models that exist in the catalogue', () => {
    for (const bundle of MODEL_BUNDLES) {
      for (const id of bundleModelIds(bundle)) {
        expect(() => getModelSpec(id)).not.toThrow();
      }
    }
  });

  it('pairs exactly one speech model with one language model', () => {
    for (const bundle of MODEL_BUNDLES) {
      expect(getModelSpec(bundle.sttModelId).kind).toBe('stt');
      expect(getModelSpec(bundle.llmModelId).kind).toBe('llm');
    }
  });

  it('downloads speech first so transcription can start sooner', () => {
    const bundle = getBundle('standard');
    expect(bundleModelIds(bundle)[0]).toBe(bundle.sttModelId);
  });

  it('sums the download size across both models', () => {
    const bundle = getBundle('standard');
    expect(bundleBytes(bundle)).toBe(
      getModelSpec(bundle.sttModelId).approxBytes + getModelSpec(bundle.llmModelId).approxBytes,
    );
  });

  it('keeps light smaller than standard', () => {
    expect(bundleBytes(getBundle('light'))).toBeLessThan(bundleBytes(getBundle('standard')));
  });

  it('throws on an unknown bundle rather than returning undefined', () => {
    // @ts-expect-error — exercising the runtime guard
    expect(() => getBundle('enormous')).toThrow('UNKNOWN_BUNDLE:enormous');
  });

  it('has a default that exists', () => {
    expect(() => getBundle(DEFAULT_BUNDLE_ID)).not.toThrow();
  });
});

describe('recommendedBundle', () => {
  it('gives a low-end device the light bundle', () => {
    expect(recommendedBundle('low').id).toBe('light');
  });

  it('gives a mid device the standard bundle', () => {
    expect(recommendedBundle('mid').id).toBe('standard');
  });

  it('gives a high-end device the largest affordable bundle', () => {
    expect(recommendedBundle('high').id).toBe('standard');
  });

  it('never recommends a bundle the device cannot run', () => {
    const rank = { low: 0, mid: 1, high: 2 } as const;
    for (const deviceClass of ['low', 'mid', 'high'] as const) {
      const bundle = recommendedBundle(deviceClass);
      expect(rank[bundle.minDeviceClass]).toBeLessThanOrEqual(rank[deviceClass]);
    }
  });
});
