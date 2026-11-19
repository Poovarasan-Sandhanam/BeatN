import { buildWavHeader } from '../pcm';
import { bytesToSamples, parseWavHeader } from '../voiceAnalysis';

describe('parseWavHeader', () => {
  it('reads back the header this app writes', () => {
    const header = buildWavHeader(32_000, 16_000, 1);
    expect(parseWavHeader(header)).toEqual({ sampleRate: 16_000, channels: 1, bitsPerSample: 16 });
  });

  it('rejects anything that is not a WAV', () => {
    expect(parseWavHeader(new Uint8Array(44))).toBeNull();
    expect(parseWavHeader(new Uint8Array(10))).toBeNull();
  });
});

describe('bytesToSamples', () => {
  it('decodes little-endian signed 16-bit, including negatives', () => {
    const bytes = Uint8Array.from([0x01, 0x00, 0xff, 0xff, 0x00, 0x80, 0xff, 0x7f]);
    expect(Array.from(bytesToSamples(bytes))).toEqual([1, -1, -32768, 32767]);
  });

  it('works on a view that does not start on an even byte', () => {
    const backing = Uint8Array.from([0, 0x02, 0x00]);
    expect(Array.from(bytesToSamples(backing.subarray(1)))).toEqual([2]);
  });
});
