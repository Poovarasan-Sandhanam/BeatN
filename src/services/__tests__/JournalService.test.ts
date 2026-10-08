import type { WavRecording } from '../../core/audio/useWavRecorder';
import { isUuidv7 } from '../../domain/shared/ids';
import { JournalService, type JournalServiceDeps } from '../JournalService';

const recording: WavRecording = {
  uri: 'file:///recordings/1.wav',
  durationMs: 30_000,
  byteLength: 960_044,
  capturedSampleRate: 16_000,
  capturedChannels: 1,
};

const counterRandom = () => {
  let i = 0;
  return (n: number) => Uint8Array.from({ length: n }, () => i++ & 0xff);
};

function makeService(overrides: Partial<JournalServiceDeps> = {}) {
  const order: string[] = [];
  const created: unknown[] = [];
  const enqueued: { entryId: string; type: string }[] = [];

  const entries = {
    create: jest.fn(async (entry: unknown) => {
      order.push('create');
      created.push(entry);
    }),
    list: jest.fn(async () => []),
    findById: jest.fn(async () => null),
    setFavourite: jest.fn(async () => {}),
    softDelete: jest.fn(async () => {
      order.push('softDelete');
    }),
  };

  const jobs = {
    enqueue: jest.fn(async (entryId: string, type: string) => {
      order.push(`enqueue:${type}`);
      enqueued.push({ entryId, type });
      return true;
    }),
  };

  const queue = {
    nudge: jest.fn(() => {
      order.push('nudge');
    }),
  };

  const service = new JournalService({
    entries,
    jobs,
    queue,
    deviceId: 'device-a',
    random: counterRandom(),
    now: () => 1_700_000_000_000,
    ...overrides,
  } as unknown as JournalServiceDeps);

  return { service, order, created, enqueued, entries, jobs, queue };
}

describe('createEntryFromRecording', () => {
  it('writes the entry before queueing any work', async () => {
    const h = makeService();
    await h.service.createEntryFromRecording(recording);

    // Ordering is the guarantee: a recording can never be lost because
    // transcription failed.
    expect(h.order).toEqual(['create', 'enqueue:transcribe', 'nudge']);
  });

  it('returns a UUIDv7 id', async () => {
    const h = makeService();
    const id = await h.service.createEntryFromRecording(recording);
    expect(isUuidv7(id)).toBe(true);
  });

  it('stores the entry in the recorded state with no AI output', async () => {
    const h = makeService();
    await h.service.createEntryFromRecording(recording);

    expect(h.created[0]).toMatchObject({
      processingState: 'recorded',
      transcript: null,
      reflection: null,
      mood: null,
      deletedAt: null,
      deviceId: 'device-a',
    });
  });

  it('records the captured audio format, not the requested one', async () => {
    const h = makeService();
    await h.service.createEntryFromRecording({
      ...recording,
      capturedSampleRate: 48_000,
      capturedChannels: 2,
    });

    expect(h.created[0]).toMatchObject({
      audio: expect.objectContaining({ sampleRate: 48_000, channels: 2 }),
    });
  });

  it('queues transcription at raised priority, ahead of background work', async () => {
    const h = makeService();
    await h.service.createEntryFromRecording(recording);

    expect(h.jobs.enqueue).toHaveBeenCalledWith(expect.any(String), 'transcribe', {
      priority: 10,
    });
  });

  it('wakes the worker rather than waiting for its next poll', async () => {
    const h = makeService();
    await h.service.createEntryFromRecording(recording);
    expect(h.queue.nudge).toHaveBeenCalledTimes(1);
  });
});

describe('retry', () => {
  it('re-queues transcription when there is no transcript yet', async () => {
    const h = makeService();
    h.entries.findById = jest.fn(async () => ({ id: 'e1', transcript: null })) as never;

    await h.service.retry('e1');
    expect(h.enqueued).toEqual([{ entryId: 'e1', type: 'transcribe' }]);
  });

  it('re-queues analysis when the transcript already exists', async () => {
    const h = makeService();
    h.entries.findById = jest.fn(async () => ({ id: 'e1', transcript: { text: 'x' } })) as never;

    await h.service.retry('e1');
    expect(h.enqueued).toEqual([{ entryId: 'e1', type: 'analyse' }]);
  });

  it('does nothing for an entry that no longer exists', async () => {
    const h = makeService();
    await h.service.retry('missing');
    expect(h.enqueued).toEqual([]);
  });
});

describe('delete', () => {
  it('soft deletes, so the tombstone can sync later', async () => {
    const h = makeService();
    await h.service.delete('e1');
    expect(h.entries.softDelete).toHaveBeenCalledWith('e1');
  });
});
