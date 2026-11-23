/**
 * The application service screens talk to.
 *
 * Screens call this; this calls repositories, the queue and the model runtime.
 * No screen imports SQLite, llama.rn or whisper.rn — enforced by
 * `src/__tests__/architecture.test.ts`.
 */

import type { JournalEntry } from '../domain/entry/JournalEntry';
import { describeVoice, type VoiceReading } from '../domain/voice/voiceCues';
import { uuidv7, type RandomSource } from '../domain/ids';
import {
  fileName,
  type JournalEntryRepository,
} from '../core/db/repositories/JournalEntryRepository';
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
  /**
   * Called after any change the user made — save, delete, retry. Background
   * jobs report through the queue; this covers everything else, so a list
   * reflects the user's own action the moment it lands.
   */
  onChange?: () => void;
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
  async createEntryFromRecording(
    recording: WavRecording,
    /** When it was recorded. Defaults to now; recovery passes the original time. */
    createdAt: number = this.now(),
  ): Promise<string> {
    const timestamp = createdAt;
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
      voice: null,
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
    this.deps.onChange?.();

    return id;
  }

  /**
   * Adds recordings found on disk that no entry knows about — left behind by
   * a kill while paused or a crash mid-recording. Run once at launch, before
   * anything can be recording. Returns how many were added.
   */
  async recoverUnsavedRecordings(
    found: readonly (WavRecording & { createdAt: number })[],
  ): Promise<number> {
    if (found.length === 0) return 0;
    const known = await this.deps.entries.knownRecordingNames();
    let added = 0;
    for (const recording of found) {
      if (known.has(fileName(recording.uri))) continue;
      await this.createEntryFromRecording(recording, recording.createdAt);
      added += 1;
    }
    return added;
  }

  list(limit = 50, offset = 0): Promise<JournalEntry[]> {
    return this.deps.entries.list({ limit, offset });
  }

  findById(id: string): Promise<JournalEntry | null> {
    return this.deps.entries.findById(id);
  }

  /** How the entry sounded, judged against the person's own recent entries. */
  async voiceReading(entry: JournalEntry): Promise<VoiceReading | null> {
    if (!entry.voice) return null;
    return describeVoice(entry.voice, await this.deps.entries.recentVoices(entry.id));
  }

  async setFavourite(id: string, isFavourite: boolean): Promise<void> {
    await this.deps.entries.setFavourite(id, isFavourite);
    this.deps.onChange?.();
  }

  async delete(id: string): Promise<void> {
    await this.deps.entries.softDelete(id);
    this.deps.onChange?.();
  }

  /** Re-queue a failed entry at the step that failed. */
  async retry(id: string): Promise<void> {
    const entry = await this.deps.entries.findById(id);
    if (!entry) return;

    const type = entry.transcript ? 'analyse' : 'transcribe';
    await this.deps.jobs.enqueue(id, type, { priority: 10 });
    this.deps.queue.nudge();
    this.deps.onChange?.();
  }
}
