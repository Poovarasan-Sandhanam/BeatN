import { File } from 'expo-file-system';

/** Deletes a recording from the phone. Best effort: a file already gone is fine. */
export function deleteRecordingFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Locked or already removed. A later launch's sweep tries again.
  }
}
