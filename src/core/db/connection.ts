/**
 * The only place `expo-sqlite` is imported.
 *
 * Everything else depends on the `Database` port, which is what makes the
 * repositories testable off-device (expo-sqlite's native module is mocked
 * under Jest) and the driver replaceable.
 */
import * as SQLite from 'expo-sqlite';

import { uuidv7, type RandomSource } from '../../domain/shared/ids';
import { cryptoRandomSource } from '../platform/randomSource';
import { migrate } from './migrations';
import type { Database, SqlValue } from './types';

export const DATABASE_NAME = 'beatn.db';

let connection: Database | null = null;
let opening: Promise<Database> | null = null;

/**
 * Wraps expo-sqlite in the `Database` port.
 *
 * Written out rather than relying on structural typing: `SQLiteDatabase`
 * requires its `params` argument, while the port makes it optional, so the
 * two are not assignable. An explicit adapter also keeps the coupling in one
 * readable place.
 */
function adapt(db: SQLite.SQLiteDatabase): Database {
  return {
    execAsync: (source) => db.execAsync(source),
    runAsync: (source, params = []) => db.runAsync(source, params),
    getFirstAsync<T>(source: string, params: SqlValue[] = []) {
      return db.getFirstAsync<T>(source, params);
    },
    getAllAsync<T>(source: string, params: SqlValue[] = []) {
      return db.getAllAsync<T>(source, params);
    },
    withTransactionAsync: (task) => db.withTransactionAsync(task),
  };
}

/**
 * Opens the database and brings the schema up to date.
 *
 * Concurrent callers share one in-flight open: two screens mounting at once
 * must not race two migrations against the same file. A failed open is not
 * cached, otherwise every later attempt would fail too.
 */
export function openDatabase(): Promise<Database> {
  if (connection) return Promise.resolve(connection);

  if (!opening) {
    opening = (async () => {
      const db = adapt(await SQLite.openDatabaseAsync(DATABASE_NAME));
      await migrate(db);
      connection = db;
      return db;
    })().catch((error: unknown) => {
      opening = null;
      throw error;
    });
  }

  return opening;
}

/** Test seam: drops the cached handle so the next open starts clean. */
export function resetConnectionForTests(): void {
  connection = null;
  opening = null;
}

const DEVICE_ID_KEY = 'device_id';

/**
 * A stable per-install identifier, needed on every row so that sync can tell
 * which device wrote what. Stored in the database rather than in secure
 * storage: it is not a secret, and it must live and die with the data.
 */
export async function getOrCreateDeviceId(
  db: Database,
  random: RandomSource = cryptoRandomSource,
): Promise<string> {
  const existing = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ?',
    [DEVICE_ID_KEY],
  );
  if (existing?.value) return existing.value;

  const deviceId = uuidv7(random);
  await db.runAsync('INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)', [
    DEVICE_ID_KEY,
    deviceId,
  ]);

  // Re-read: another caller may have won the INSERT OR IGNORE race.
  const stored = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ?',
    [DEVICE_ID_KEY],
  );
  return stored?.value ?? deviceId;
}
