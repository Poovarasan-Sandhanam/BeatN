import { isPlaintextSqliteHeader, rawKey } from '../encryption';

const header = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

describe('isPlaintextSqliteHeader', () => {
  it('recognises an unencrypted SQLite file', () => {
    expect(isPlaintextSqliteHeader(header('SQLite format 3\0'))).toBe(true);
  });

  it('treats random-looking bytes as encrypted', () => {
    expect(isPlaintextSqliteHeader(Uint8Array.from({ length: 16 }, (_, i) => (i * 37) & 0xff))).toBe(
      false,
    );
  });

  it('does not read past a short file', () => {
    expect(isPlaintextSqliteHeader(header('SQLite'))).toBe(false);
  });
});

describe('rawKey', () => {
  const key = 'ab'.repeat(32);

  it('uses SQLCipher raw-key syntax, skipping passphrase derivation', () => {
    expect(rawKey(key)).toBe(`"x'${key}'"`);
  });

  it.each(['', 'ab'.repeat(31), 'AB'.repeat(32), `${'ab'.repeat(31)}'"`, 'zz'.repeat(32)])(
    'refuses anything but 64 lowercase hex characters: %p',
    (bad) => {
      expect(() => rawKey(bad)).toThrow('DATABASE_KEY_INVALID');
    },
  );
});
