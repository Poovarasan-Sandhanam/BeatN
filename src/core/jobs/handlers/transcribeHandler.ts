/**
 * Turns a recording into a transcript, then queues the analysis.
 *
 * Idempotent, because a job can run twice: if the app is killed after the
 * transcript is written but before the row is marked complete, the job is
 * reclaimed and re-run. Re-running must not redo the expensive work or
 * corrupt the entry.
 */

import { isReadable } from '../../../domain/entry/JournalEntry';
import { cleanTranscript } from '../../../domain/entry/transcript';
import type { JobHandler } from '../types';
import { MissingModelError, type HandlerDeps } from './types';

export function createTranscribeHandler({
  entries,
  jobs,
  runtime,
  resolveModel,
  now = Date.now,
}: HandlerDeps): JobHandler {
  return async (job) => {
    const entry = await entries.findById(job.entryId);
    // Deleted while queued. Nothing to do, and not an error.
    if (!entry) return;

    // Already transcribed by an earlier run of this same job.
    if (entry.transcript) {
      await jobs.enqueue(entry.id, 'analyse', { priority: job.priority });
      return;
    }

    if (!entry.audio.uri) throw new Error('RECORDING_AUDIO_MISSING');

    const model = resolveModel('stt');
    if (!model) throw new MissingModelError('stt');

    if (!isReadable(entry.processingState)) {
      await entries.setProcessingState(entry.id, entry.processingState, 'transcribing');
    }

    const audioUri = entry.audio.uri;
    const result = await runtime.useStt(
      model,
      (engine) => engine.transcribe(audioUri, { language: 'en' }),
      'foreground',
    );

    const text = cleanTranscript(result.text);

    await entries.saveTranscript(entry.id, {
      text,
      language: result.language ?? null,
      provenance: { modelId: model.modelId, modelVersion: '1', generatedAt: now() },
    });

    await entries.setProcessingState(entry.id, 'transcribing', 'transcribed');

    // Silence: nothing to analyse. Finishing here keeps the language model from
    // inventing a reflection for an entry with no words in it.
    if (text === '') {
      await entries.setProcessingState(entry.id, 'transcribed', 'ready');
      return;
    }

    // The next step is queued, not called: if analysis fails it retries on its
    // own schedule without re-running transcription.
    await jobs.enqueue(entry.id, 'analyse', { priority: job.priority });
  };
}
