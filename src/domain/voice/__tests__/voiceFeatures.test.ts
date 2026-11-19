import {
  countWords,
  detectPitch,
  extractVoiceFeatures,
  sampleWindows,
  withSpeakingRate,
} from '../voiceFeatures';

const RATE = 16_000;

/** A voiced tone: fundamental plus harmonics, like a sung vowel. */
function tone(seconds: number, hz: number | ((t: number) => number), amplitude = 0.3): Int16Array {
  const out = new Int16Array(Math.round(seconds * RATE));
  let phase = 0;
  for (let i = 0; i < out.length; i += 1) {
    const f = typeof hz === 'number' ? hz : hz(i / RATE);
    phase += (2 * Math.PI * f) / RATE;
    const v = Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase);
    out[i] = Math.round((v / 1.75) * amplitude * 32767);
  }
  return out;
}

/** Deterministic low-level noise, standing in for a quiet room. */
function hiss(seconds: number, amplitude = 0.002): Int16Array {
  const out = new Int16Array(Math.round(seconds * RATE));
  let seed = 1;
  for (let i = 0; i < out.length; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    out[i] = Math.round(((seed / 0x7fffffff) * 2 - 1) * amplitude * 32767);
  }
  return out;
}

function concat(...parts: Int16Array[]): Int16Array {
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe('detectPitch', () => {
  it.each([90, 120, 180, 220, 300])('finds %i Hz within 2%', (hz) => {
    const frame = tone(0.032, hz);
    const pitch = detectPitch(frame, 0, frame.length, RATE);
    expect(pitch).not.toBeNull();
    expect(Math.abs((pitch as number) - hz) / hz).toBeLessThan(0.02);
  });

  it('reports no pitch for noise', () => {
    const frame = hiss(0.032, 0.3);
    expect(detectPitch(frame, 0, frame.length, RATE)).toBeNull();
  });
});

describe('extractVoiceFeatures', () => {
  it('returns null for silence — nothing to judge', () => {
    expect(extractVoiceFeatures(hiss(3), RATE)).toBeNull();
  });

  it('returns null for a clip too short to measure', () => {
    expect(extractVoiceFeatures(tone(0.05, 150), RATE)).toBeNull();
  });

  it('measures pitch and finds a steady tone flat', () => {
    const features = extractVoiceFeatures(concat(hiss(0.5), tone(3, 150), hiss(0.5)), RATE);
    expect(features).not.toBeNull();
    expect(features!.pitchHz).toBeCloseTo(150, -1);
    expect(features!.pitchVariationSemitones!).toBeLessThan(0.3);
    expect(features!.voicedRatio).toBeGreaterThan(0.6);
  });

  it('measures more pitch movement for an animated voice than a flat one', () => {
    // Swings ±4 semitones around 180 Hz, twice a second.
    const animated = tone(3, (t) => 180 * 2 ** ((4 * Math.sin(2 * Math.PI * 2 * t)) / 12));
    const flat = tone(3, 180);
    const a = extractVoiceFeatures(concat(hiss(0.3), animated, hiss(0.3)), RATE)!;
    const f = extractVoiceFeatures(concat(hiss(0.3), flat, hiss(0.3)), RATE)!;
    expect(a.pitchVariationSemitones!).toBeGreaterThan(2);
    expect(a.pitchVariationSemitones!).toBeGreaterThan(f.pitchVariationSemitones! * 5);
  });

  it('counts long pauses between phrases, ignoring silence before and after', () => {
    const phrase = () => tone(1, 160);
    const halting = concat(hiss(1), phrase(), hiss(1), phrase(), hiss(1), phrase(), hiss(1));
    const fluent = concat(hiss(1), phrase(), phrase(), phrase(), hiss(1));
    const h = extractVoiceFeatures(halting, RATE)!;
    const f = extractVoiceFeatures(fluent, RATE)!;
    // Two 1 s pauses inside a 5 s speaking span.
    expect(h.pauseRatio).toBeGreaterThan(0.3);
    expect(h.pauseRatio).toBeLessThan(0.5);
    expect(f.pauseRatio).toBeLessThan(0.05);
  });

  it('reads a quieter voice as quieter', () => {
    const loud = extractVoiceFeatures(concat(hiss(0.5), tone(2, 150, 0.5), hiss(0.5)), RATE)!;
    const quiet = extractVoiceFeatures(concat(hiss(0.5), tone(2, 150, 0.1), hiss(0.5)), RATE)!;
    expect(loud.loudnessDb - quiet.loudnessDb).toBeCloseTo(14, 0);
  });
});

describe('withSpeakingRate', () => {
  it('measures pace over the speaking span, not the whole recording', () => {
    const features = extractVoiceFeatures(concat(hiss(2), tone(4, 150), hiss(2)), RATE)!;
    // 20 words over a 4 s speaking span is 300 wpm, though the clip lasts 8 s.
    const paced = withSpeakingRate(features, 20, 8_000);
    expect(paced.wordsPerMinute).toBeGreaterThan(270);
    expect(paced.wordsPerMinute).toBeLessThan(330);
  });

  it('leaves pace unknown with no words', () => {
    const features = extractVoiceFeatures(tone(2, 150), RATE)!;
    expect(withSpeakingRate(features, 0, 2_000).wordsPerMinute).toBeNull();
  });
});

describe('sampleWindows', () => {
  it('takes everything when the recording is short', () => {
    expect(sampleWindows(100, 30, 4)).toEqual([[0, 100]]);
  });

  it('spreads windows evenly across a long recording, ending at the end', () => {
    const windows = sampleWindows(1000, 100, 4);
    expect(windows).toEqual([
      [0, 100],
      [300, 100],
      [600, 100],
      [900, 100],
    ]);
  });
});

describe('countWords', () => {
  it.each([
    ['', 0],
    ['   ', 0],
    ['hello', 1],
    ['I went  for a\nwalk.', 5],
  ])('%p has %i words', (text, count) => {
    expect(countWords(text)).toBe(count);
  });
});

describe('voice detection edge cases', () => {
  it('still finds voice in speech with no gaps at all', () => {
    const features = extractVoiceFeatures(tone(2, 150), RATE);
    expect(features).not.toBeNull();
    expect(features!.voicedRatio).toBeGreaterThan(0.9);
  });

  it('never mistakes a quiet room for speech', () => {
    expect(extractVoiceFeatures(hiss(3, 0.01), RATE)).toBeNull();
  });
});
