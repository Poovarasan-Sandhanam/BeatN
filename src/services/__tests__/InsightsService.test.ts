import type { JournalEntry } from '../../domain/entry/JournalEntry';
import type { VoiceFeatures } from '../../domain/voice/voiceFeatures';
import { InsightsService, withEnergy } from '../InsightsService';

const nov = (date: number, hour = 12) => new Date(2026, 10, date, hour).getTime();
const provenance = { modelId: 'm', modelVersion: '1', generatedAt: 0 };

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

const entry = (date: number, overrides: Partial<JournalEntry> = {}): JournalEntry =>
  ({
    id: `e${date}`,
    createdAt: nov(date),
    audio: { uri: null, durationMs: 60_000, sampleRate: 16000, channels: 1, byteLength: 0 },
    reflection: { title: null, summary: `Summary ${date}`, suggestion: null, provenance },
    mood: { value: 'calm', confidence: 0.7, provenance },
    topics: [{ name: 'work', confidence: 0.9 }],
    voice: null,
    ...overrides,
  }) as JournalEntry;

function service(entries: JournalEntry[], earlier: VoiceFeatures[] = []) {
  const repo = {
    listBetween: jest.fn(async () => entries),
    voicesBefore: jest.fn(async () => earlier),
  };
  const prompts: string[] = [];
  const runtime = {
    useLlm: jest.fn(async (_m: unknown, work: (e: unknown) => Promise<unknown>) =>
      work({
        generateStructured: async (prompt: string) => {
          prompts.push(prompt);
          return { value: { overview: 'o', patterns: [], suggestions: ['s'], outlook: 'x' } };
        },
      }),
    ),
  };
  const insights = new InsightsService({
    entries: repo as never,
    runtime: runtime as never,
    resolveModel: () => ({ modelId: 'llm', path: '/m', approxBytes: 1 }),
  });
  return { insights, repo, prompts };
}

describe('InsightsService.periodData', () => {
  it('queries the span from the first chosen day to the end of the last', async () => {
    const { insights, repo } = service([]);
    await insights.periodData(['2026-11-23', '2026-11-20']);
    expect(repo.listBetween).toHaveBeenCalledWith(nov(20, 0), nov(24, 0));
  });

  it('keeps only the chosen days — Monday and Friday never pull in Tuesday', async () => {
    const { insights } = service([entry(16), entry(17), entry(20)]);
    const data = await insights.periodData(['2026-11-16', '2026-11-20']);
    expect(data.stats.entryCount).toBe(2);
    expect(data.notes.map((n) => n.summary)).toEqual(['Summary 16', 'Summary 20']);
  });

  it('handles an empty selection without touching the database', async () => {
    const { insights, repo } = service([]);
    const data = await insights.periodData([]);
    expect(data.stats.entryCount).toBe(0);
    expect(repo.listBetween).not.toHaveBeenCalled();
  });
});

describe('InsightsService.reflect', () => {
  it('asks the model with the computed facts and returns its words', async () => {
    const { insights, prompts } = service([entry(23)]);
    const data = await insights.periodData(['2026-11-23']);
    const reflection = await insights.reflect(data, 'Today');
    expect(reflection.suggestions).toEqual(['s']);
    expect(prompts[0]).toContain('Period: Today (1 day, 1 with entries).');
  });
});

describe('withEnergy', () => {
  it('judges each entry against the voices recorded before it', () => {
    const usual = Array.from({ length: 5 }, () => voice());
    const quiet = voice({ loudnessDb: -36, wordsPerMinute: 100, pitchVariationSemitones: 1.5, pauseRatio: 0.4 });
    const result = withEnergy([entry(23, { voice: quiet }), entry(22, { voice: voice() })], usual);

    expect(result.map((e) => e.createdAt)).toEqual([nov(22), nov(23)]);
    expect(result[0].energy).toBe('typical');
    expect(result[1].energy).toBe('low');
  });

  it('leaves energy unknown for entries without a voice', () => {
    expect(withEnergy([entry(23)], [])[0].energy).toBeNull();
  });
});
