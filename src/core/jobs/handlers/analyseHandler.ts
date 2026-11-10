/**
 * Derives the reflection — summary, mood, topics — from a transcript.
 *
 * Sampling is grammar-constrained, so malformed JSON cannot be produced; Zod
 * still validates the meaning. A failure here leaves the transcript intact and
 * readable, which is the point of running analysis as a separate job.
 */

import {
  buildAnalysisPrompt,
  entryAnalysisJsonSchema,
  validateEntryAnalysis,
} from '../../ai/analysis';
import { cleanTranscript } from '../../../domain/entry/transcript';
import type { JobHandler } from '../types';
import { MissingModelError, type HandlerDeps } from './types';

export function createAnalyseHandler({
  entries,
  runtime,
  resolveModel,
  now = Date.now,
}: HandlerDeps): JobHandler {
  return async (job) => {
    const entry = await entries.findById(job.entryId);
    if (!entry) return;

    // Transcription has not finished yet; its handler re-queues this job.
    if (!entry.transcript) throw new Error('TRANSCRIPT_NOT_READY');

    // Already analysed by an earlier run of this job.
    if (entry.reflection && entry.processingState === 'ready') return;

    // Cleaned here as well as at transcription, so entries saved before the
    // cleaner existed do not send "[BLANK_AUDIO]" to the model.
    const transcript = cleanTranscript(entry.transcript.text);
    if (transcript === '') {
      // No speech: finish without a reflection rather than ask the model to
      // summarise nothing. Walk the legal path from wherever the entry is.
      if (entry.processingState === 'ready') return;
      if (entry.processingState === 'transcribed') {
        await entries.setProcessingState(entry.id, 'transcribed', 'ready');
        return;
      }
      if (entry.processingState === 'failed') {
        await entries.setProcessingState(entry.id, 'failed', 'analysing');
      }
      await entries.setProcessingState(entry.id, 'analysing', 'analysed');
      await entries.setProcessingState(entry.id, 'analysed', 'ready');
      return;
    }

    const model = resolveModel('llm');
    if (!model) throw new MissingModelError('llm');

    if (entry.processingState === 'transcribed' || entry.processingState === 'failed') {
      await entries.setProcessingState(entry.id, entry.processingState, 'analysing');
    }

    const structured = await runtime.useLlm(
      model,
      (engine) =>
        engine.generateStructured(
          buildAnalysisPrompt(transcript),
          entryAnalysisJsonSchema,
          validateEntryAnalysis,
          { maxTokens: 300 },
        ),
      'foreground',
    );

    const provenance = {
      modelId: model.modelId,
      modelVersion: '1',
      promptVersion: 'analysis-v1',
      generatedAt: now(),
    };

    await entries.saveAnalysis(
      entry.id,
      { title: null, summary: structured.value.summary, provenance },
      {
        value: structured.value.mood,
        confidence: structured.value.moodConfidence,
        provenance,
      },
      structured.value.topics,
      [],
    );

    await entries.setProcessingState(entry.id, 'analysing', 'analysed');
    await entries.setProcessingState(entry.id, 'analysed', 'ready');
  };
}
