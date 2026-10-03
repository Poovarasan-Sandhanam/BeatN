/**
 * The database port.
 *
 * Repositories depend on this, not on `expo-sqlite`. Two reasons:
 *   - `expo-sqlite`'s native module is mocked under Jest (`NativeDatabase is
 *     not a constructor`), so a direct dependency would make every repository
 *     untestable off-device.
 *   - It keeps the swap to a different driver a one-adapter change.
 *
 * `SQLiteDatabase` from expo-sqlite satisfies this structurally.
 */

export type SqlValue = string | number | null;

export interface SqlRunResult {
  lastInsertRowId: number;
  changes: number;
}

export interface Database {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: SqlValue[]): Promise<SqlRunResult>;
  getFirstAsync<T>(source: string, params?: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, params?: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/** Thrown when a row cannot be mapped — corrupt data, or a missed migration. */
export class RowMappingError extends Error {
  constructor(
    readonly table: string,
    readonly column: string,
    readonly value: unknown,
  ) {
    super(`ROW_MAPPING_FAILED:${table}.${column}`);
    this.name = 'RowMappingError';
  }
}
