/**
 * At-rest encryption for the journal database (SQLCipher).
 *
 * Kept beside `connection.ts` because it is the other half of opening the
 * database: deciding which file to open, converting an older plaintext file,
 * and proving the key fits before anything else touches the connection.
 */
import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

/** Every plaintext SQLite file starts with these 16 bytes. SQLCipher files look random. */
const SQLITE_HEADER = 'SQLite format 3\0';

export function isPlaintextSqliteHeader(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_HEADER.length) return false;
  for (let i = 0; i < SQLITE_HEADER.length; i += 1) {
    if (bytes[i] !== SQLITE_HEADER.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * SQLCipher's raw-key form: `x'<64 hex>'` uses the bytes as the key directly
 * instead of running a passphrase through PBKDF2, so opening is instant.
 * The key is hex we generated, so interpolating it cannot inject SQL — the
 * assertion makes that a guarantee rather than an assumption.
 */
export function rawKey(hexKey: string): string {
  if (!/^[0-9a-f]{64}$/.test(hexKey)) throw new Error('DATABASE_KEY_INVALID');
  return `"x'${hexKey}'"`;
}

function databasePath(name: string): string {
  return `${SQLite.defaultDatabaseDirectory}/${name}`;
}

function fileAt(path: string): File {
  return new File(`file://${path}`);
}

export type DatabaseFileState = 'missing' | 'plaintext' | 'encrypted';

export function inspectDatabaseFile(name: string): DatabaseFileState {
  const file = fileAt(databasePath(name));
  if (!file.exists || file.size === 0) return 'missing';

  const handle = file.open();
  try {
    return isPlaintextSqliteHeader(handle.readBytes(16)) ? 'plaintext' : 'encrypted';
  } finally {
    handle.close();
  }
}

function deleteWithSidecars(path: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const file = fileAt(`${path}${suffix}`);
    if (file.exists) file.delete();
  }
}

/**
 * Converts a plaintext database to SQLCipher in place.
 *
 * Writes an encrypted copy beside the original and swaps it in only once the
 * export has succeeded, so a failure at any point leaves the original intact.
 * `sqlcipher_export` copies tables and data but not `user_version`, which is
 * what tracks migrations — so that is carried over by hand.
 */
export async function encryptPlaintextDatabase(name: string, hexKey: string): Promise<void> {
  const path = databasePath(name);
  const tempName = `${name}.encrypting`;
  const tempPath = databasePath(tempName);
  deleteWithSidecars(tempPath);

  const plain = await SQLite.openDatabaseAsync(name, { useNewConnection: true });
  try {
    // Fold the write-ahead log into the main file so the export sees everything.
    await plain.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
    const row = await plain.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const version = Math.trunc(row?.user_version ?? 0);

    await plain.execAsync(`ATTACH DATABASE '${tempPath}' AS encrypted KEY ${rawKey(hexKey)}`);
    await plain.execAsync(`SELECT sqlcipher_export('encrypted')`);
    await plain.execAsync(`PRAGMA encrypted.user_version = ${version}`);
    await plain.execAsync('DETACH DATABASE encrypted');
  } catch (error) {
    await plain.closeAsync().catch(() => {});
    deleteWithSidecars(tempPath);
    throw error;
  }
  await plain.closeAsync();

  deleteWithSidecars(path);
  fileAt(tempPath).move(fileAt(path));
}

/**
 * Sets aside a database the current key cannot open, so the app can start
 * fresh instead of failing on every launch. Kept, not deleted: if the key
 * turns up again (a restored backup), the entries are still recoverable.
 */
export function setAsideUnreadableDatabase(name: string, now: number = Date.now()): void {
  const path = databasePath(name);
  const file = fileAt(path);
  if (file.exists) file.move(fileAt(databasePath(`${name}.unreadable-${now}`)));
  for (const suffix of ['-wal', '-shm', '-journal']) {
    const sidecar = fileAt(`${path}${suffix}`);
    if (sidecar.exists) sidecar.delete();
  }
}

/**
 * Applies the key, then proves it fits. SQLCipher accepts any key silently;
 * the first real read is what fails if it is wrong.
 */
export async function unlockDatabase(db: SQLite.SQLiteDatabase, hexKey: string): Promise<void> {
  await db.execAsync(`PRAGMA key = ${rawKey(hexKey)}`);
  try {
    await db.getFirstAsync('SELECT count(*) AS count FROM sqlite_master');
  } catch {
    throw new Error('DATABASE_KEY_MISMATCH');
  }
}
