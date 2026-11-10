import * as SecureStore from 'expo-secure-store';

import { getOrCreateDatabaseKey, isValidKeyHex, toHex } from '../databaseKey';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    WHEN_UNLOCKED: 'WHEN_UNLOCKED',
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    __store: store,
  };
});

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;
const counting = (n: number) => Uint8Array.from({ length: n }, (_, i) => i);

beforeEach(() => store.clear());

describe('toHex', () => {
  it('pads every byte to two digits', () => {
    expect(toHex(Uint8Array.from([0, 15, 255]))).toBe('000fff');
  });
});

describe('getOrCreateDatabaseKey', () => {
  it('creates a 256-bit key on first use and stores it', async () => {
    const { key, created } = await getOrCreateDatabaseKey(counting);
    expect(created).toBe(true);
    expect(isValidKeyHex(key)).toBe(true);
    expect([...store.values()]).toEqual([key]);
  });

  it('returns the same key afterwards instead of making a new one', async () => {
    const first = await getOrCreateDatabaseKey(counting);
    const second = await getOrCreateDatabaseKey(() => new Uint8Array(32).fill(9));
    expect(second).toEqual({ key: first.key, created: false });
  });

  it('keeps the key backup-portable, so a new phone can still read the journal', async () => {
    await getOrCreateDatabaseKey(counting);
    const options = (SecureStore.setItemAsync as jest.Mock).mock.calls[0][2];
    expect(options.keychainAccessible).toBe('WHEN_UNLOCKED');
  });

  it('replaces a stored value that is not a key this app wrote', async () => {
    store.set('beatn.database-key.v1', 'not-a-key');
    const { key, created } = await getOrCreateDatabaseKey(counting);
    expect(created).toBe(true);
    expect(isValidKeyHex(key)).toBe(true);
  });
});
