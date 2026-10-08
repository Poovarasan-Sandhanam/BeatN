/**
 * The application service screens talk to.
 *
 * Screens call this; this calls repositories, the queue and the model runtime.
 * No screen imports SQLite, llama.rn or whisper.rn — enforced by
 * `src/__tests__/architecture.test.ts`.
 */

import type { JournalEntry } from '../domain/entry/JournalEntry';
import { uuidv7, type RandomSource } from '../domain/shared/ids';
import type { JournalEntryRepository } from '../core/db/repositories/JournalEntryRepository';
import type { ProcessingJobRepository } from '../core/db/repositories/ProcessingJobRepository';
import type { ProcessingQueue } from '../core/jobs/ProcessingQueue';
import type { WavRecording } from '../core/audio/useWavRecorder';

export interface JournalServiceDeps {
  entries: JournalEntryRepository;
  jobs: ProcessingJobRepository;
  queue: ProcessingQueue;
  deviceId: string;
  random: RandomSource;
  now?: () => number;
}

export class JournalService {
  private readonly now: () => number;

  constructor(private readonly deps: JournalServiceDeps) {
    this.now = deps.now ?? Date.now;
  }

  /**
   * Persist a finished recording and queue its processing.
   *
   * Ordering is the whole point: the row is written and the job queued
   * *before* this returns, and no AI runs on this path. The caller can
   * navigate away immediately and the recording can never be lost because
   * transcription failed.
   */
  async createEntryFromRecording(recording: WavRecording): Promise<string> {
    const timestamp = this.now();
    const id = uuidv7(this.deps.random, timestamp);

    const entry: JournalEntry = {
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      audio: {
        uri: recording.uri,
        durationMs: recording.durationMs,
        sampleRate: recording.capturedSampleRate,
        channels: recording.capturedChannels,
        byteLength: recording.byteLength,
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
      deviceId: this.deps.deviceId,
    };

    await this.deps.entries.create(entry);
    await this.deps.jobs.enqueue(id, 'transcribe', { priority: 10 });
    // Wake the worker rather than waiting for its next poll.
    this.deps.queue.nudge();

    return id;
  }

  list(limit = 50, offset = 0): Promise<JournalEntry[]> {
    return this.deps.entries.list({ limit, offset });
  }

  findById(id: string): Promise<JournalEntry | null> {
    return this.deps.entries.findById(id);
  }

  async setFavourite(id: string, isFavourite: boolean): Promise<void> {
    await this.deps.entries.setFavourite(id, isFavourite);
  }

  async delete(id: string): Promise<void> {
    await this.deps.entries.softDelete(id);
  }

  /** Re-queue a failed entry at the step that failed. */
  async retry(id: string): Promise<void> {
    const entry = await this.deps.entries.findById(id);
    if (!entry) return;

    const type = entry.transcript ? 'analyse' : 'transcribe';
    await this.deps.jobs.enqueue(id, type, { priority: 10 });
    this.deps.queue.nudge();
  }
}
