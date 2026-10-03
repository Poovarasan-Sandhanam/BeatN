import {
  WHISPER_SAMPLE_RATE,
  buildWavHeader,
  downmixToMono,
  encodeWav,
  peakAmplitude,
  resampleLinear,
  toWhisperPcm,
} from '../pcm';

function readAscii(view: DataView, offset: number, length: number): string {
  let text = '';
  for (let i = 0; i < length; i += 1) text += String.fromCharCode(view.getUint8(offset + i));
  return text;
}

describe('downmixToMono', () => {
  it('returns the input untouched when already mono', () => {
    const mono = new Int16Array([1, 2, 3]);
    expect(downmixToMono(mono, 1)).toBe(mono);
  });

  it('averages interleaved stereo frames', () => {
    const stereo = new Int16Array([100, 300, -200, 0]);
    expect(Array.from(downmixToMono(stereo, 2))).toEqual([200, -100]);
  });

  it('drops a trailing partial frame rather than reading past the end', () => {
    const stereo = new Int16Array([100, 300, 50]);
    expect(downmixToMono(stereo, 2)).toHaveLength(1);
  });
});

describe('resampleLinear', () => {
  it('is a no-op at the same rate', () => {
    const samples = new Int16Array([1, 2, 3]);
    expect(resampleLinear(samples, 16000, 16000)).toBe(samples);
  });

  it('halves the sample count when downsampling 2:1', () => {
    const samples = new Int16Array(100).fill(1000);
    expect(resampleLinear(samples, 32000, 16000)).toHaveLength(50);
  });

  it('preserves a constant signal', () => {
    const samples = new Int16Array(48).fill(500);
    const out = resampleLinear(samples, 48000, 16000);
    expect(Array.from(out).every((value) => value === 500)).toBe(true);
  });

  it('handles empty input', () => {
    expect(resampleLinear(new Int16Array(0), 48000, 16000)).toHaveLength(0);
  });
});

describe('toWhisperPcm', () => {
  it('normalises 48 kHz stereo to 16 kHz mono', () => {
    // 48 frames of stereo at 48 kHz → 16 frames of mono at 16 kHz.
    const samples = new Int16Array(96).fill(700);
    const out = toWhisperPcm({ samples, sampleRate: 48000, channels: 2 });
    expect(out).toHaveLength(16);
    expect(Array.from(out).every((value) => value === 700)).toBe(true);
  });

  it('passes through audio already in the target format', () => {
    const samples = new Int16Array([1, 2, 3, 4]);
    const out = toWhisperPcm({ samples, sampleRate: WHISPER_SAMPLE_RATE, channels: 1 });
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
  });
});

describe('buildWavHeader', () => {
  it('writes a canonical 16-bit PCM RIFF header', () => {
    const dataBytes = 320;
    const header = buildWavHeader(dataBytes, 16000, 1);
    const view = new DataView(header.buffer);

    expect(header).toHaveLength(44);
    expect(readAscii(view, 0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + dataBytes);
    expect(readAscii(view, 8, 4)).toBe('WAVE');
    expect(readAscii(view, 12, 4)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(28, true)).toBe(32000); // byte rate
    expect(view.getUint16(32, true)).toBe(2); // block align
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(readAscii(view, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(dataBytes);
  });
});

describe('encodeWav', () => {
  it('prefixes the samples with a matching header', () => {
    const samples = new Int16Array([0, 1000, -1000, 32767]);
    const wav = encodeWav(samples);

    expect(wav).toHaveLength(44 + samples.byteLength);

    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getUint32(40, true)).toBe(samples.byteLength);
    // Samples are little-endian immediately after the header.
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(1000);
    expect(view.getInt16(48, true)).toBe(-1000);
    expect(view.getInt16(50, true)).toBe(32767);
  });
});

describe('peakAmplitude', () => {
  it('reports 0 for silence', () => {
    expect(peakAmplitude(new Int16Array(1600))).toBe(0);
  });

  it('approaches 1 at full scale', () => {
    const samples = new Int16Array(1600).fill(32767);
    expect(peakAmplitude(samples)).toBeCloseTo(1, 3);
  });

  it('never exceeds 1 at the negative rail', () => {
    const samples = new Int16Array(1600).fill(-32768);
    expect(peakAmplitude(samples)).toBeLessThanOrEqual(1);
  });
});
