/**
 * UUIDv7 — a time-ordered UUID.
 *
 * Chosen over v4 because BeatN needs IDs that are simultaneously:
 *   - globally unique across devices (sync has no coordinator), and
 *   - sortable by creation time (they double as pagination cursors, and give
 *     SQLite a monotonic primary key rather than a random one, which keeps
 *     B-tree inserts from fragmenting the index).
 *
 * Layout (RFC 9562):
 *   48 bits  big-endian unix timestamp in milliseconds
 *    4 bits  version (7)
 *   12 bits  random
 *    2 bits  variant (0b10)
 *   62 bits  random
 */

/**
 * Randomness is a *port*, not an import. Domain code must not depend on
 * expo-crypto (or any platform), so the adapter is injected at the edge.
 * See `src/core/platform/randomSource.ts` for the production implementation.
 */
export type RandomSource = (byteLength: number) => Uint8Array;

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

export function uuidv7(random: RandomSource, now: number = Date.now()): string {
  if (!Number.isFinite(now) || now < 0) {
    throw new RangeError('uuidv7: timestamp must be a non-negative finite number');
  }

  const bytes = new Uint8Array(16);
  const rand = random(10);
  if (rand.length < 10) {
    throw new Error('uuidv7: RandomSource returned fewer bytes than requested');
  }

  // 48-bit timestamp. Written via division rather than bit-shifts because
  // JavaScript's bitwise operators truncate to 32 bits.
  const ms = Math.floor(now);
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ms / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(ms / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  bytes.set(rand, 6);

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 0b10

  let out = '';
  for (let i = 0; i < 16; i += 1) {
    out += HEX[bytes[i]];
    if (i === 3 || i === 5 || i === 7 || i === 9) out += '-';
  }
  return out;
}

/** Extract the embedded creation time. Useful for cursors and for assertions. */
export function uuidv7Timestamp(id: string): number {
  const hex = id.replace(/-/g, '').slice(0, 12);
  if (hex.length !== 12 || !/^[0-9a-f]{12}$/i.test(hex)) {
    throw new TypeError(`uuidv7Timestamp: not a UUIDv7: ${id}`);
  }
  return parseInt(hex, 16);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidv7(value: string): boolean {
  return UUID_PATTERN.test(value);
}
