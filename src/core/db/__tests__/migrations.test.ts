import {
  LATEST_VERSION,
  MIGRATIONS,
  assertMigrationsValid,
  migrate,
  pendingMigrations,
  type Migration,
} from '../migrations';
import type { Database, SqlRunResult } from '../types';

const fakeMigrations: Migration[] = [
  { version: 1, name: 'one', up: 'CREATE TABLE a (id INTEGER);' },
  { version: 2, name: 'two', up: 'CREATE TABLE b (id INTEGER);' },
  { version: 3, name: 'three', up: 'CREATE TABLE c (id INTEGER);' },
];

/** Records what was executed; runs no SQL. */
class RecordingDatabase implements Database {
  executed: string[] = [];
  transactions = 0;
  userVersion: number;
  failOn: string | null = null;

  constructor(userVersion = 0) {
    this.userVersion = userVersion;
  }

  async execAsync(source: string): Promise<void> {
    if (this.failOn && source.includes(this.failOn)) throw new Error('SQL_FAILED');
    this.executed.push(source.trim());
    const match = /PRAGMA user_version = (\d+)/.exec(source);
    if (match) this.userVersion = Number(match[1]);
  }

  async runAsync(): Promise<SqlRunResult> {
    return { lastInsertRowId: 0, changes: 0 };
  }

  async getFirstAsync<T>(source: string): Promise<T | null> {
    if (source.includes('user_version')) {
      return { user_version: this.userVersion } as unknown as T;
    }
    return null;
  }

  async getAllAsync<T>(): Promise<T[]> {
    return [];
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.transactions += 1;
    await task();
  }
}

describe('pendingMigrations', () => {
  it('returns everything for a fresh database', () => {
    expect(pendingMigrations(0, fakeMigrations).map((m) => m.version)).toEqual([1, 2, 3]);
  });

  it('returns only what is newer than the current version', () => {
    expect(pendingMigrations(2, fakeMigrations).map((m) => m.version)).toEqual([3]);
  });

  it('returns nothing when up to date', () => {
    expect(pendingMigrations(3, fakeMigrations)).toEqual([]);
  });

  it('returns nothing when the database is newer than the app', () => {
    // A downgrade must not try to run migrations backwards.
    expect(pendingMigrations(9, fakeMigrations)).toEqual([]);
  });
});

describe('assertMigrationsValid', () => {
  it('accepts the real migration list', () => {
    expect(() => assertMigrationsValid()).not.toThrow();
  });

  it('rejects a duplicated version', () => {
    expect(() =>
      assertMigrationsValid([
        { version: 1, name: 'a', up: '' },
        { version: 1, name: 'b', up: '' },
      ]),
    ).toThrow(/MIGRATIONS_NOT_CONTIGUOUS/);
  });

  it('rejects a gap', () => {
    expect(() =>
      assertMigrationsValid([
        { version: 1, name: 'a', up: '' },
        { version: 3, name: 'c', up: '' },
      ]),
    ).toThrow(/MIGRATIONS_NOT_CONTIGUOUS/);
  });

  it('rejects a list that does not start at 1', () => {
    expect(() => assertMigrationsValid([{ version: 0, name: 'zero', up: '' }])).toThrow(
      /MIGRATIONS_NOT_CONTIGUOUS/,
    );
  });
});

describe('migrate', () => {
  it('applies every migration to a fresh database', async () => {
    const db = new RecordingDatabase(0);
    const reached = await migrate(db, fakeMigrations);

    expect(reached).toBe(3);
    expect(db.userVersion).toBe(3);
    expect(db.transactions).toBe(3);
  });

  it('sets the connection pragmas before migrating', async () => {
    const db = new RecordingDatabase(0);
    await migrate(db, fakeMigrations);

    expect(db.executed[0]).toContain('PRAGMA foreign_keys = ON');
    expect(db.executed[0]).toContain('journal_mode = WAL');
  });

  it('is a no-op on an up-to-date database', async () => {
    const db = new RecordingDatabase(3);
    await migrate(db, fakeMigrations);

    expect(db.transactions).toBe(0);
    expect(db.executed.some((sql) => sql.includes('CREATE TABLE'))).toBe(false);
  });

  it('resumes from a partially migrated database', async () => {
    const db = new RecordingDatabase(2);
    await migrate(db, fakeMigrations);

    expect(db.transactions).toBe(1);
    expect(db.executed.some((sql) => sql.includes('CREATE TABLE c'))).toBe(true);
    expect(db.executed.some((sql) => sql.includes('CREATE TABLE a'))).toBe(false);
  });

  it('leaves the version at the last fully applied migration when one fails', async () => {
    const db = new RecordingDatabase(0);
    db.failOn = 'CREATE TABLE c';

    await expect(migrate(db, fakeMigrations)).rejects.toThrow('SQL_FAILED');
    expect(db.userVersion).toBe(2);
  });

  it('reaches LATEST_VERSION with the real migration list', async () => {
    const db = new RecordingDatabase(0);
    expect(await migrate(db)).toBe(LATEST_VERSION);
    expect(LATEST_VERSION).toBe(MIGRATIONS.length);
  });
});
