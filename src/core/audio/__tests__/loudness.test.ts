import {
  LevelHistogram,
  MIN_USEFUL_GAIN,
  applyGain,
  meterLevel,
  normalisationGain,
  softLimit,
} from '../loudness';

const dbfs = (amplitude: number) => 20 * Math.log10(amplitude);

/** A sine at a given peak level, like steady speech energy. */
function tone(peak: number, n = 16_000): Int16Array {
  return Int16Array.from({ length: n }, (_, i) => Math.round(Math.sin(i / 7) * peak * 32767));
}

describe('normalisationGain', () => {
  it('brings a recording at -27 dBFS up to about -3 dBFS', () => {
    const h = new LevelHistogram();
    h.add(tone(0.045)); // ≈ -27 dBFS, what the iPhone 14 recordings measured
    const gain = normalisationGain(h);
    expect(dbfs(0.045 * gain)).toBeGreaterThan(-4);
    expect(dbfs(0.045 * gain)).toBeLessThan(-2);
  });

  it('never turns a recording down', () => {
    const h = new LevelHistogram();
    h.add(tone(0.95));
    expect(normalisationGain(h)).toBe(1);
  });

  it('caps the boost at +30 dB, so a near-silent room does not become hiss', () => {
    const h = new LevelHistogram();
    h.add(tone(0.004)); // ≈ -48 dBFS: quiet, but above the silence floor
    expect(normalisationGain(h)).toBeCloseTo(31.6, 1);
  });

  it('leaves digital silence alone', () => {
    const h = new LevelHistogram();
    h.add(new Int16Array(16_000));
    expect(normalisationGain(h)).toBe(1);
  });

  it('is not held down by a single click', () => {
    const quiet = tone(0.03);
    quiet[100] = 32000; // one tap on the phone
    const h = new LevelHistogram();
    h.add(quiet);
    expect(normalisationGain(h)).toBeGreaterThan(15);
  });

  it('skips the rewrite when the change would be inaudible', () => {
    const h = new LevelHistogram();
    h.add(tone(0.68));
    expect(normalisationGain(h)).toBeLessThan(MIN_USEFUL_GAIN);
  });
});

describe('applyGain', () => {
  it('boosts in place', () => {
    const samples = Int16Array.from([100, -100, 0]);
    applyGain(samples, 10);
    expect(Array.from(samples)).toEqual([1000, -1000, 0]);
  });

  it('never wraps around past full scale, even with a huge boost', () => {
    const samples = Int16Array.from([20000, -20000]);
    applyGain(samples, 30);
    expect(samples[0]).toBeGreaterThan(29000);
    expect(samples[0]).toBeLessThanOrEqual(32767);
    expect(samples[1]).toBeLessThan(-29000);
  });
});

describe('softLimit', () => {
  it('leaves normal levels untouched', () => {
    expect(softLimit(0.5)).toBe(0.5);
    expect(softLimit(-0.8)).toBe(-0.8);
  });

  it('bends peaks smoothly towards full scale without reaching past it', () => {
    expect(softLimit(1.5)).toBeLessThanOrEqual(1);
    expect(softLimit(1.0)).toBeLessThan(1);
    expect(softLimit(1.5)).toBeGreaterThan(softLimit(1.0));
    expect(softLimit(-3)).toBeGreaterThanOrEqual(-1);
  });
});

describe('meterLevel', () => {
  it('reads quiet raw speech as a visible level, not a flat line', () => {
    expect(meterLevel(0.045)).toBeGreaterThan(0.5); // -27 dBFS
  });

  it('spans 0 at -60 dBFS to 1 at full scale', () => {
    expect(meterLevel(0.001)).toBe(0);
    expect(meterLevel(0)).toBe(0);
    expect(meterLevel(1)).toBe(1);
  });
});
