import { Directory, Paths } from 'expo-file-system';

/** Journal recordings. Anything here with no entry is recovered at launch. */
export const RECORDINGS_DIRNAME = 'recordings';

export function recordingsDirectory(name: string = RECORDINGS_DIRNAME): Directory {
  const directory = new Directory(Paths.document, name);
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}
