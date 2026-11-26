const CURRENT = 'file:///Containers/NEW/Documents';

jest.mock('expo-file-system', () => {
  const join = (...parts: string[]) => parts.join('/');
  class Directory {
    uri: string;
    exists = true;
    constructor(parent: { uri: string } | string, name: string) {
      this.uri = join(typeof parent === 'string' ? parent : parent.uri, name);
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(parent: { uri: string }, name: string) {
      this.uri = join(parent.uri, name);
    }
  }
  return { Directory, File, Paths: { document: { uri: 'file:///Containers/NEW/Documents' } } };
});

import { currentRecordingUri } from '../recordingsFolder';

describe('currentRecordingUri', () => {
  it('re-anchors a recording saved by an earlier install to the current folder', () => {
    expect(currentRecordingUri('file:///Containers/OLD/Documents/recordings/1795659434349.wav')).toBe(
      `${CURRENT}/recordings/1795659434349.wav`,
    );
  });

  it('works for Android-style paths too', () => {
    expect(currentRecordingUri('file:///data/user/0/com.beatn.app/files/recordings/17.wav')).toBe(
      `${CURRENT}/recordings/17.wav`,
    );
  });

  it.each([
    'file:///Containers/OLD/Library/Caches/clip.wav', // not a journal recording
    'file:///Containers/OLD/Documents/recordings/', // no file name
    'file:///Containers/OLD/Documents/recordings/nested/17.wav', // not directly in the folder
  ])('leaves %p alone', (uri) => {
    expect(currentRecordingUri(uri)).toBe(uri);
  });
});
