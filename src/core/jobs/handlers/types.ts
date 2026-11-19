import type { JournalEntryRepository } from '../../db/repositories/JournalEntryRepository';
import type { ProcessingJobRepository } from '../../db/repositories/ProcessingJobRepository';
import type { ModelRuntime, ModelRef } from '../../ai/ModelRuntime';
import type { VoiceFeatures } from '../../../domain/voice/voiceFeatures';

/**
 * What a handler needs from the rest of the app.
 *
 * Passed in rather than imported so handlers stay unit-testable: every
 * dependency here can be faked.
 */
export interface HandlerDeps {
  entries: JournalEntryRepository;
  jobs: ProcessingJobRepository;
  runtime: ModelRuntime;
  /** Resolves the active model for a step. Null when it is not downloaded. */
  resolveModel: (kind: 'stt' | 'llm') => ModelRef | null;
  /** Measures the voice in a recording. Optional: mood still works from words alone. */
  analyseVoice?: (audioUri: string) => Promise<VoiceFeatures | null>;
  now?: () => number;
}

export class MissingModelError extends Error {
  constructor(kind: 'stt' | 'llm') {
    super(`MODEL_NOT_INSTALLED:${kind}`);
    this.name = 'MissingModelError';
  }
}
