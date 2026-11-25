import type { WavRecording } from '../../core/audio/useWavRecorder';
import { isUuidv7 } from '../../domain/ids';
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
    knownRecordingNames: jest.fn(async () => new Set<string>(['known.wav'])),
    eraseEntry: jest.fn(async () => {
      order.push('eraseEntry');
      return 'file:///r/1.wav';
    }),
    eraseDeletedContent: jest.fn(async () => ['file:///r/old.wav']),
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
  it('erases rather than hard-deletes, so a tombstone can sync later', async () => {
    const h = makeService();
    await h.service.delete('e1');
    expect(h.entries.eraseEntry).toHaveBeenCalledWith('e1');
  });
});

describe('onChange', () => {
  // Lists only refetch when told to. A user action that does not notify
  // leaves a new entry missing, or a deleted one visible, until some
  // unrelated background job happens to finish.
  function withChangeLog() {
    const h = makeService({
      onChange: () => {
        h.order.push('onChange');
      },
    });
    return h;
  }

  it('fires after a new entry is saved and queued, never before', async () => {
    const h = withChangeLog();
    await h.service.createEntryFromRecording(recording);
    expect(h.order).toEqual(['create', 'enqueue:transcribe', 'nudge', 'onChange']);
  });

  it('fires after a delete lands', async () => {
    const h = withChangeLog();
    await h.service.delete('e1');
    expect(h.order).toEqual(['eraseEntry', 'onChange']);
  });

  it('fires after a favourite changes', async () => {
    const h = withChangeLog();
    await h.service.setFavourite('e1', true);
    expect(h.order).toEqual(['onChange']);
  });

  it('fires after a retry is queued', async () => {
    const h = withChangeLog();
    h.entries.findById.mockResolvedValueOnce({ id: 'e1', transcript: null } as never);
    await h.service.retry('e1');
    expect(h.order).toEqual(['enqueue:transcribe', 'nudge', 'onChange']);
  });

  it('stays silent when a retry finds nothing to do', async () => {
    const h = withChangeLog();
    await h.service.retry('missing');
    expect(h.order).toEqual([]);
  });

  it('is optional', async () => {
    const h = makeService();
    await expect(h.service.delete('e1')).resolves.toBeUndefined();
  });
});

describe('recoverUnsavedRecordings', () => {
  const found = (name: string, createdAt: number) => ({
    ...recording,
    uri: `file:///var/mobile/Documents/recordings/${name}`,
    createdAt,
  });

  it('adds recordings no entry knows about, dated when they were recorded', async () => {
    const h = makeService();
    const added = await h.service.recoverUnsavedRecordings([found('lost.wav', 1_600_000_000_000)]);

    expect(added).toBe(1);
    expect(h.created).toHaveLength(1);
    expect(h.created[0]).toMatchObject({ createdAt: 1_600_000_000_000, processingState: 'recorded' });
    // Queued for transcription like any new entry.
    expect(h.enqueued).toEqual([expect.objectContaining({ type: 'transcribe' })]);
  });

  it('never re-adds a recording an entry already has — deleted entries included', async () => {
    const h = makeService();
    // The path prefix differs between installs; the file name is what matches.
    const added = await h.service.recoverUnsavedRecordings([found('known.wav', 1)]);

    expect(added).toBe(0);
    expect(h.created).toEqual([]);
  });

  it('does not touch the database when there is nothing to recover', async () => {
    const h = makeService();
    expect(await h.service.recoverUnsavedRecordings([])).toBe(0);
    expect(h.entries.knownRecordingNames).not.toHaveBeenCalled();
  });
});

describe('erasing', () => {
  it('deletes the recording file after erasing the entry', async () => {
    const deleteAudio = jest.fn();
    const h = makeService({ deleteAudio });
    await h.service.delete('e1');
    expect(h.entries.eraseEntry).toHaveBeenCalledWith('e1');
    expect(deleteAudio).toHaveBeenCalledWith('file:///r/1.wav');
  });

  it('finishes erasing entries that older versions only hid', async () => {
    const deleteAudio = jest.fn();
    const h = makeService({ deleteAudio });
    await h.service.eraseDeletedLeftovers();
    expect(h.entries.eraseDeletedContent).toHaveBeenCalled();
    expect(deleteAudio).toHaveBeenCalledWith('file:///r/old.wav');
  });
});

