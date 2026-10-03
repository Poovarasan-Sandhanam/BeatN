export interface TranscriptionOptions {
  language?: string;
  maxThreads?: number;
  translate?: boolean;
  onProgress?: (percent: number) => void;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  /** Length of the source audio. */
  durationMs: number;
  /** Wall-clock time spent inside the engine. */
  processingTimeMs: number;
}

/**
 * UI and feature code depends on this, never on whisper.rn directly, so the
 * model or the underlying runtime can change without touching callers.
 */
export interface SpeechToTextEngine {
  readonly id: string;
  readonly isLoaded: boolean;

  loadModel(modelPath: string): Promise<void>;
  unloadModel(): Promise<void>;

  transcribe(audioPath: string, options?: TranscriptionOptions): Promise<TranscriptionResult>;
}
