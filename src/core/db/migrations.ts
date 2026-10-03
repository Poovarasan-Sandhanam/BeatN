/**
 * Forward-only migrations, tracked with `PRAGMA user_version`.
 *
 * Rules:
 *   - A shipped migration is immutable. Fixing a mistake means adding another.
 *   - Versions are contiguous from 1. `assertMigrationsValid` enforces both,
 *     so a bad merge fails a unit test rather than a user's upgrade.
 */

import { CONNECTION_PRAGMAS, SCHEMA_V1 } from './schema';
import type { Database } from './types';

export interface Migration {
  version: number;
  name: string;
  up: string;
}

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'initial schema', up: SCHEMA_V1 },
];

export const LATEST_VERSION = MIGRATIONS.length;

/** Pure: which migrations still need applying. */
export function pendingMigrations(
  currentVersion: number,
  all: readonly Migration[] = MIGRATIONS,
): Migration[] {
  return all.filter((migration) => migration.version > currentVersion);
}

/** Pure: fails loudly on a duplicated, missing or misordered version. */
export function assertMigrationsValid(all: readonly Migration[] = MIGRATIONS): void {
  all.forEach((migration, index) => {
    const expected = index + 1;
    if (migration.version !== expected) {
      throw new Error(
        `MIGRATIONS_NOT_CONTIGUOUS: expected version ${expected}, found ${migration.version} (${migration.name})`,
      );
    }
  });
}

interface UserVersionRow {
  user_version: number;
}

/**
 * Brings the database up to `LATEST_VERSION` and returns the version reached.
 *
 * Each migration runs inside its own transaction, so a failure part-way
 * through leaves `user_version` at the last version that fully applied rather
 * than at a half-migrated state.
 */
export async function migrate(
  db: Database,
  all: readonly Migration[] = MIGRATIONS,
): Promise<number> {
  assertMigrationsValid(all);

  await db.execAsync(CONNECTION_PRAGMAS);

  const row = await db.getFirstAsync<UserVersionRow>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  for (const migration of pendingMigrations(version, all)) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.up);
      // PRAGMA does not accept a bound parameter, and `version` is an integer
      // from our own migration list, never user input.
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
    version = migration.version;
  }

  return version;
}
