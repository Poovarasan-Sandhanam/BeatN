import { MODEL_CATALOG } from '../catalog';

describe('model catalog integrity data', () => {
  it.each(MODEL_CATALOG.map((spec) => [spec.id, spec]))(
    '%s has an exact size and checksums to verify downloads against',
    (_id, spec) => {
      expect(Number.isInteger(spec.bytes)).toBe(true);
      expect(spec.bytes).toBeGreaterThan(1_000_000);
      expect(spec.approxBytes).toBe(spec.bytes);
      expect(spec.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(spec.md5).toMatch(/^[0-9a-f]{32}$/);
    },
  );

  it('never reuses a checksum, which would mean a copy-paste error', () => {
    const md5s = MODEL_CATALOG.map((spec) => spec.md5);
    expect(new Set(md5s).size).toBe(md5s.length);
  });
});
