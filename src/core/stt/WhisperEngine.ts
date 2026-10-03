// whisper.rn 0.7.4 ships an "exports" map with no "." entry, so the bare
// package specifier fails to resolve under package-exports resolution.
// "whisper.rn/index" matches its "./*" entry and resolves for both TypeScript
// and Metro. Fixed upstream in 0.8.0 — drop the suffix when we move to it.
import { initWhisper, type WhisperContext } from 'whisper.rn/index';

import type { SpeechToTextEngine, TranscriptionOptions, TranscriptionResult } from './types';

export interface WhisperEngineOptions {
  /** Core ML on iOS / GPU where available. Disable to benchmark the CPU path. */
  useGpu?: boolean;
  useCoreMLIos?: boolean;
}

export class WhisperEngine implements SpeechToTextEngine {
  readonly id = 'whisper.rn';
  /** Lets ModelResidencyManager treat this as a LoadableEngine. */
  readonly kind = 'stt' as const;

  private context: WhisperContext | null = null;
  private loadTimeMs = 0;

  constructor(private readonly options: WhisperEngineOptions = {}) {}

  get isLoaded(): boolean {
    return this.context !== null;
  }

  /** Milliseconds the last successful loadModel() took. */
  get modelLoadTimeMs(): number {
    return this.loadTimeMs;
  }

  /** True when whisper.cpp reported a GPU/Core ML backend for this context. */
  get usingGpu(): boolean {
    return this.context?.gpu ?? false;
  }

  get reasonNoGpu(): string {
    return this.context?.reasonNoGPU ?? '';
  }

  async loadModel(modelPath: string): Promise<void> {
    if (this.context) await this.unloadModel();

    const startedAt = Date.now();
    this.context = await initWhisper({
      filePath: modelPath,
      useGpu: this.options.useGpu ?? true,
      useCoreMLIos: this.options.useCoreMLIos ?? true,
    });
    this.loadTimeMs = Date.now() - startedAt;
  }

  async unloadModel(): Promise<void> {
    if (!this.context) return;
    const context = this.context;
    this.context = null;
    await context.release();
  }

  async transcribe(
    audioPath: string,
    options: TranscriptionOptions = {},
  ): Promise<TranscriptionResult> {
    const context = this.context;
    if (!context) throw new Error('WHISPER_MODEL_NOT_LOADED');

    const startedAt = Date.now();
    const { promise } = context.transcribe(audioPath, {
      language: options.language ?? 'en',
      maxThreads: options.maxThreads,
      translate: options.translate ?? false,
      onProgress: options.onProgress,
    });

    const result = await promise;
    const processingTimeMs = Date.now() - startedAt;

    const lastSegment = result.segments?.[result.segments.length - 1];
    // whisper.cpp reports segment timestamps in centiseconds.
    const durationMs = lastSegment ? lastSegment.t1 * 10 : 0;

    return {
      text: result.result.trim(),
      language: result.language || options.language,
      durationMs,
      processingTimeMs,
    };
  }
}
