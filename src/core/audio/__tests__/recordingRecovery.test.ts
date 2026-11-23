import { headerRepairFor, startTimeFromName } from '../recordingRecovery';

describe('headerRepairFor', () => {
  it('leaves a correct header alone', () => {
    expect(headerRepairFor(44 + 32_000, 32_000)).toBeNull();
  });

  it('fixes a header left at "0 bytes" by a kill mid-recording', () => {
    expect(headerRepairFor(44 + 32_000, 0)).toBe(32_000);
  });

  it('fixes a header from an earlier pause checkpoint, now behind the audio', () => {
    expect(headerRepairFor(44 + 64_000, 32_000)).toBe(64_000);
  });

  it('counts whole 16-bit samples only, ignoring a half-written last byte', () => {
    expect(headerRepairFor(44 + 1001, 0)).toBe(1000);
  });

  it('has nothing to fix in a header-only file', () => {
    expect(headerRepairFor(44, 0)).toBeNull();
  });
});

describe('startTimeFromName', () => {
  it('reads the start time the recorder put in the name', () => {
    expect(startTimeFromName('1795438491637.wav')).toBe(1_795_438_491_637);
  });

  it.each(['notes.wav', '._1795438491637.wav', '1795438491637.wav.encrypting', '123.wav'])(
    'ignores %p, which the recorder did not write',
    (name) => {
      expect(startTimeFromName(name)).toBeNull();
    },
  );
});
