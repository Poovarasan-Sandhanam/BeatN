import { Directory, File, Paths } from 'expo-file-system';

/** Journal recordings. Anything here with no entry is recovered at launch. */
export const RECORDINGS_DIRNAME = 'recordings';

export function recordingsDirectory(name: string = RECORDINGS_DIRNAME): Directory {
  const directory = new Directory(Paths.document, name);
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

/**
 * Where a recording saved under `storedUri` is now.
 *
 * Entries store an absolute file URI, but iOS can move the app's container
 * when the app is updated: the file survives with the same name while the old
 * path leads nowhere — playback goes dead and deleting an entry would leave
 * its audio behind. Anything stored in a recordings folder is re-anchored to
 * the current one; any other URI is returned unchanged.
 */
export function currentRecordingUri(storedUri: string, name: string = RECORDINGS_DIRNAME): string {
  const marker = `/${name}/`;
  const at = storedUri.lastIndexOf(marker);
  if (at === -1) return storedUri;
  const fileName = storedUri.slice(at + marker.length);
  if (fileName === '' || fileName.includes('/')) return storedUri;
  return new File(recordingsDirectory(name), fileName).uri;
}
