import { describeVoice, voiceSummaryForPrompt } from '../voiceCues';
import type { VoiceFeatures } from '../voiceFeatures';

const voice = (overrides: Partial<VoiceFeatures> = {}): VoiceFeatures => ({
  version: 1,
  analysedSeconds: 30,
  voicedRatio: 0.7,
  loudnessDb: -24,
  loudnessVariationDb: 6,
  pitchHz: 160,
  pitchVariationSemitones: 3.5,
  pauseRatio: 0.2,
  wordsPerMinute: 150,
  speechSpanRatio: 0.9,
  ...overrides,
});

/** Five ordinary entries with natural jitter. */
const usual = [
  voice({ loudnessDb: -24, wordsPerMinute: 148, pitchVariationSemitones: 3.4, pauseRatio: 0.19 }),
  voice({ loudnessDb: -23, wordsPerMinute: 155, pitchVariationSemitones: 3.7, pauseRatio: 0.21 }),
  voice({ loudnessDb: -25, wordsPerMinute: 145, pitchVariationSemitones: 3.3, pauseRatio: 0.2 }),
  voice({ loudnessDb: -24, wordsPerMinute: 152, pitchVariationSemitones: 3.6, pauseRatio: 0.22 }),
  voice({ loudnessDb: -22, wordsPerMinute: 150, pitchVariationSemitones: 3.5, pauseRatio: 0.18 }),
];

describe('describeVoice', () => {
  it('reports nothing for an ordinary entry', () => {
    const reading = describeVoice(voice(), usual);
    expect(reading.cues).toEqual([]);
    expect(reading.energy).toBe('typical');
    expect(reading.personal).toBe(true);
  });

  it('reads quiet, slow, flat and halting as low energy', () => {
    const reading = describeVoice(
      voice({ loudnessDb: -33, wordsPerMinute: 105, pitchVariationSemitones: 1.6, pauseRatio: 0.38 }),
      usual,
    );
    expect(reading.energy).toBe('low');
    expect(reading.cues.map((c) => c.label)).toEqual(
      expect.arrayContaining(['quieter than usual', 'slower than usual', 'flatter, more monotone than usual']),
    );
  });

  it('reads loud, fast and animated as high energy', () => {
    const reading = describeVoice(
      voice({ loudnessDb: -15, wordsPerMinute: 205, pitchVariationSemitones: 6.5, pauseRatio: 0.08 }),
      usual,
    );
    expect(reading.energy).toBe('high');
    expect(reading.cues[0].direction).toBe('higher');
  });

  it('leads with the strongest cue', () => {
    const reading = describeVoice(voice({ wordsPerMinute: 230, loudnessDb: -20 }), usual);
    expect(reading.cues[0].trait).toBe('pace');
  });

  it('judges against typical speech until there are enough entries, and ignores loudness then', () => {
    const reading = describeVoice(voice({ loudnessDb: -40, wordsPerMinute: 80 }), usual.slice(0, 2));
    expect(reading.personal).toBe(false);
    expect(reading.cues.map((c) => c.trait)).toEqual(['pace']);
    expect(reading.cues[0].label).toBe('slower than typical');
  });

  it('is not thrown by one odd entry in the history', () => {
    const withOutlier = [...usual, voice({ wordsPerMinute: 400, loudnessDb: 0 })];
    expect(describeVoice(voice(), withOutlier).cues).toEqual([]);
  });

  it('does not turn tiny wobbles into cues when the baseline is very consistent', () => {
    const identical = Array.from({ length: 5 }, () => voice());
    expect(describeVoice(voice({ wordsPerMinute: 156, loudnessDb: -23 }), identical).cues).toEqual([]);
  });

  it('skips what could not be measured', () => {
    const reading = describeVoice(voice({ pitchVariationSemitones: null, wordsPerMinute: null }), usual);
    expect(reading.cues.every((c) => c.trait !== 'pace' && c.trait !== 'pitchVariation')).toBe(true);
  });
});

describe('voiceSummaryForPrompt', () => {
  it('says what stood out and against what', () => {
    const reading = describeVoice(voice({ loudnessDb: -33, wordsPerMinute: 105 }), usual);
    const line = voiceSummaryForPrompt(reading);
    expect(line).toContain('quieter than usual');
    expect(line).toContain("compared with this person's usual voice");
    expect(line).toMatch(/Overall vocal energy: (low|typical)\./);
  });

  it('says so plainly when nothing stood out', () => {
    expect(voiceSummaryForPrompt(describeVoice(voice(), usual))).toContain('nothing unusual');
  });

  it('never leaks raw measurements a model might repeat to the user', () => {
    const line = voiceSummaryForPrompt(describeVoice(voice({ wordsPerMinute: 230 }), usual));
    expect(line).not.toMatch(/\d/);
  });
});
