import type { JournalEntry } from '../../../domain/entry/JournalEntry';
import { createAnalyseHandler } from '../handlers/analyseHandler';
import { createTranscribeHandler } from '../handlers/transcribeHandler';
import type { HandlerDeps } from '../handlers/types';
import type { ProcessingJob } from '../types';

const job: ProcessingJob = {
  id: 'job-1',
  entryId: 'entry-1',
  type: 'transcribe',
  status: 'running',
  priority: 0,
  attempts: 0,
  maxAttempts: 3,
  lastError: null,
  createdAt: 0,
  updatedAt: 0,
  notBefore: 0,
  startedAt: 0,
  completedAt: null,
  heartbeatAt: 0,
};

const baseEntry: JournalEntry = {
  id: 'entry-1',
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
  audio: {
    uri: 'file:///a.wav',
    durationMs: 30_000,
    sampleRate: 16_000,
    channels: 1,
    byteLength: 10,
  },
  transcript: null,
  reflection: null,
  mood: null,
  topics: [],
  entities: [],
  processingState: 'recorded',
  processingError: null,
  isFavourite: false,
  version: 1,
  deviceId: 'd1',
};

const transcript = {
  text: 'I think I want to change careers.',
  language: 'en',
  provenance: { modelId: 'whisper', modelVersion: '1', generatedAt: 1 },
};

const analysis = {
  summary: 'You are weighing up a change of direction.',
  mood: 'reflective' as const,
  moodConfidence: 0.7,
  topics: [{ name: 'career', confidence: 0.9 }],
};

function deps(entry: JournalEntry | null, overrides: Partial<HandlerDeps> = {}) {
  const transitions: string[] = [];
  const enqueued: string[] = [];
  const saved = { transcript: 0, analysis: 0 };

  const entries = {
    findById: jest.fn(async () => entry),
    setProcessingState: jest.fn(async (_id: string, from: string, to: string) => {
      transitions.push(`${from}->${to}`);
    }),
    saveTranscript: jest.fn(async () => {
      saved.transcript += 1;
    }),
    saveAnalysis: jest.fn(async () => {
      saved.analysis += 1;
    }),
  };

  const jobs = {
    enqueue: jest.fn(async (_entryId: string, type: string) => {
      enqueued.push(type);
      return true;
    }),
  };

  const runtime = {
    useStt: jest.fn(async (_m: unknown, work: (e: unknown) => Promise<unknown>) =>
      work({ transcribe: async () => ({ text: transcript.text, language: 'en' }) }),
    ),
    useLlm: jest.fn(async (_m: unknown, work: (e: unknown) => Promise<unknown>) =>
      work({ generateStructured: async () => ({ value: analysis }) }),
    ),
  };

  const resolved = { modelId: 'm1', path: '/m1', approxBytes: 100 };

  return {
    deps: {
      entries,
      jobs,
      runtime,
      resolveModel: () => resolved,
      now: () => 1,
      ...overrides,
    } as unknown as HandlerDeps,
    transitions,
    enqueued,
    saved,
    entries,
    runtime,
  };
}

describe('transcribeHandler', () => {
  it('transcribes, saves, advances state and queues analysis', async () => {
    const h = deps({ ...baseEntry });
    await createTranscribeHandler(h.deps)(job);

    expect(h.saved.transcript).toBe(1);
    expect(h.transitions).toContain('recorded->transcribing');
    expect(h.transitions).toContain('transcribing->transcribed');
    expect(h.enqueued).toEqual(['analyse']);
  });

  it('does nothing when the entry was deleted while queued', async () => {
    const h = deps(null);
    await expect(createTranscribeHandler(h.deps)(job)).resolves.toBeUndefined();
    expect(h.saved.transcript).toBe(0);
  });

  // The job can run twice if the app died before the row was marked complete.
  it('is idempotent: re-running does not transcribe again', async () => {
    const h = deps({ ...baseEntry, transcript, processingState: 'transcribed' });
    await createTranscribeHandler(h.deps)(job);

    expect(h.saved.transcript).toBe(0);
    expect(h.runtime.useStt).not.toHaveBeenCalled();
    // Still ensures the next step is queued.
    expect(h.enqueued).toEqual(['analyse']);
  });

  it('fails loudly when the speech model is not installed', async () => {
    const h = deps({ ...baseEntry }, { resolveModel: () => null });
    await expect(createTranscribeHandler(h.deps)(job)).rejects.toThrow('MODEL_NOT_INSTALLED:stt');
  });

  it('fails when the audio file reference is gone', async () => {
    const h = deps({ ...baseEntry, audio: { ...baseEntry.audio, uri: null } });
    await expect(createTranscribeHandler(h.deps)(job)).rejects.toThrow('RECORDING_AUDIO_MISSING');
  });
});

describe('analyseHandler', () => {
  const analyseJob = { ...job, type: 'analyse' as const };

  it('analyses, saves and takes the entry to ready', async () => {
    const h = deps({ ...baseEntry, transcript, processingState: 'transcribed' });
    await createAnalyseHandler(h.deps)(analyseJob);

    expect(h.saved.analysis).toBe(1);
    expect(h.transitions).toContain('transcribed->analysing');
    expect(h.transitions).toContain('analysing->analysed');
    expect(h.transitions).toContain('analysed->ready');
  });

  it('refuses to run before the transcript exists', async () => {
    const h = deps({ ...baseEntry, processingState: 'recorded' });
    await expect(createAnalyseHandler(h.deps)(analyseJob)).rejects.toThrow('TRANSCRIPT_NOT_READY');
  });

  it('is idempotent once the entry is ready', async () => {
    const h = deps({
      ...baseEntry,
      transcript,
      reflection: {
        title: null,
        summary: 'done',
        provenance: { modelId: 'm', modelVersion: '1', generatedAt: 1 },
      },
      processingState: 'ready',
    });

    await createAnalyseHandler(h.deps)(analyseJob);
    expect(h.saved.analysis).toBe(0);
  });

  it('fails loudly when the language model is not installed', async () => {
    const h = deps(
      { ...baseEntry, transcript, processingState: 'transcribed' },
      { resolveModel: () => null },
    );
    await expect(createAnalyseHandler(h.deps)(analyseJob)).rejects.toThrow(
      'MODEL_NOT_INSTALLED:llm',
    );
  });

  it('leaves the transcript readable when analysis fails', async () => {
    const h = deps({ ...baseEntry, transcript, processingState: 'transcribed' });
    (h.deps.runtime.useLlm as jest.Mock).mockRejectedValueOnce(new Error('AI_FAILED'));

    await expect(createAnalyseHandler(h.deps)(analyseJob)).rejects.toThrow('AI_FAILED');
    // The transcript was never touched.
    expect(h.entries.saveTranscript).not.toHaveBeenCalled();
  });
});
