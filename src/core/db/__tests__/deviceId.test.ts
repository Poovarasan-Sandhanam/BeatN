import { getOrCreateDeviceId } from '../connection';
import { isUuidv7 } from '../../../domain/shared/ids';
import type { Database, SqlRunResult, SqlValue } from '../types';

/** Minimal key-value stand-in for the app_meta table. */
class MetaDatabase implements Database {
  readonly rows = new Map<string, string>();
  inserts = 0;

  async execAsync(): Promise<void> {}

  async runAsync(source: string, params: SqlValue[] = []): Promise<SqlRunResult> {
    if (source.includes('INSERT OR IGNORE INTO app_meta')) {
      const [key, value] = params as string[];
      this.inserts += 1;
      // OR IGNORE: an existing key wins.
      if (!this.rows.has(key)) this.rows.set(key, value);
    }
    return { lastInsertRowId: 1, changes: 1 };
  }

  async getFirstAsync<T>(_source: string, params: SqlValue[] = []): Promise<T | null> {
    const key = params[0] as string;
    const value = this.rows.get(key);
    return value === undefined ? null : ({ value } as unknown as T);
  }

  async getAllAsync<T>(): Promise<T[]> {
    return [];
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    await task();
  }
}

const random = () => {
  let i = 0;
  return (n: number) => Uint8Array.from({ length: n }, () => i++ & 0xff);
};

describe('getOrCreateDeviceId', () => {
  it('creates a UUIDv7 on first run', async () => {
    const db = new MetaDatabase();
    const id = await getOrCreateDeviceId(db, random());

    expect(isUuidv7(id)).toBe(true);
    expect(db.rows.get('device_id')).toBe(id);
  });

  it('returns the same id on every later call', async () => {
    const db = new MetaDatabase();
    const first = await getOrCreateDeviceId(db, random());
    const second = await getOrCreateDeviceId(db, random());

    expect(second).toBe(first);
    // Only the first call writes.
    expect(db.inserts).toBe(1);
  });

  it('honours a value that another writer inserted first', async () => {
    const db = new MetaDatabase();
    db.rows.set('device_id', 'pre-existing-id');

    expect(await getOrCreateDeviceId(db, random())).toBe('pre-existing-id');
  });
});
