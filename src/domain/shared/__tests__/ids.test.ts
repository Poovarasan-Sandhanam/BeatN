import { isUuidv7, uuidv7, uuidv7Timestamp, type RandomSource } from '../ids';

/** Deterministic stub — the reason RandomSource is a port and not an import. */
const fixed = (byte: number): RandomSource => (n) => new Uint8Array(n).fill(byte);
const counter = (): RandomSource => {
  let i = 0;
  return (n) => Uint8Array.from({ length: n }, () => i++ & 0xff);
};

describe('uuidv7', () => {
  it('produces a well-formed v7 UUID', () => {
    const id = uuidv7(fixed(0xab), 1_700_000_000_000);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(isUuidv7(id)).toBe(true);
  });

  it('sets the version nibble to 7', () => {
    const id = uuidv7(fixed(0xff), 1_700_000_000_000);
    expect(id[14]).toBe('7');
  });

  it('sets the variant bits to 0b10', () => {
    const id = uuidv7(fixed(0xff), 1_700_000_000_000);
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('round-trips the timestamp', () => {
    const now = 1_735_689_600_000;
    expect(uuidv7Timestamp(uuidv7(fixed(0x00), now))).toBe(now);
  });

  it('encodes a 48-bit timestamp beyond the 32-bit range', () => {
    // 2^40 exceeds what a bit-shift implementation could represent.
    const now = 2 ** 40 + 12345;
    expect(uuidv7Timestamp(uuidv7(fixed(0x00), now))).toBe(now);
  });

  it('sorts lexicographically in creation order', () => {
    const random = counter();
    const ids = [
      uuidv7(random, 1_700_000_000_000),
      uuidv7(random, 1_700_000_000_001),
      uuidv7(random, 1_700_000_001_000),
    ];
    expect([...ids].sort()).toEqual(ids);
  });

  it('is unique across calls within the same millisecond', () => {
    const random = counter();
    const ids = new Set(Array.from({ length: 100 }, () => uuidv7(random, 1_700_000_000_000)));
    expect(ids.size).toBe(100);
  });

  it('rejects a negative timestamp', () => {
    expect(() => uuidv7(fixed(0), -1)).toThrow(RangeError);
  });

  it('rejects a RandomSource that under-delivers', () => {
    expect(() => uuidv7(() => new Uint8Array(3), 0)).toThrow(/fewer bytes/);
  });
});

describe('isUuidv7', () => {
  it('rejects a v4 UUID', () => {
    expect(isUuidv7('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(false);
  });

  it('rejects nonsense', () => {
    expect(isUuidv7('not-a-uuid')).toBe(false);
  });
});
