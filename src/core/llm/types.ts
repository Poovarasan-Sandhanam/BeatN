export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  /** Streamed tokens, used to measure time-to-first-token. */
  onToken?: (token: string) => void;
}

export interface GenerationMetrics {
  /** Time from request to the first streamed token. */
  timeToFirstTokenMs: number;
  totalTimeMs: number;
  promptTokens: number;
  predictedTokens: number;
  tokensPerSecond: number;
}

export interface GenerationResult {
  text: string;
  metrics: GenerationMetrics;
}

/**
 * UI and feature code depends on this, never on llama.rn directly, so models
 * and runtimes stay swappable per device class.
 */
export interface LocalLLMEngine {
  readonly id: string;
  readonly isLoaded: boolean;

  loadModel(modelPath: string, onProgress?: (percent: number) => void): Promise<void>;
  unloadModel(): Promise<void>;

  generate(prompt: string, options?: GenerationOptions): Promise<GenerationResult>;

  /**
   * Generate and parse JSON. The caller supplies the validator so schema
   * concerns stay in the feature layer rather than in the engine.
   */
  generateStructured<T>(
    prompt: string,
    validate: (value: unknown) => T,
    options?: GenerationOptions,
  ): Promise<{ value: T; raw: string; metrics: GenerationMetrics; attempts: number }>;
}
