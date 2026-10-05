export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  /** Streamed tokens, used to measure time-to-first-token. */
  onToken?: (token: string) => void;
  /**
   * JSON Schema to constrain sampling with. llama.cpp compiles it to a GBNF
   * grammar, so output that does not match becomes impossible to emit rather
   * than something to detect afterwards.
   */
  jsonSchema?: object;
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

export interface StructuredResult<T> {
  value: T;
  raw: string;
  metrics: GenerationMetrics;
  attempts: number;
  /** True when the sampler was grammar-constrained for this result. */
  grammarConstrained: boolean;
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

  /** True when the runtime can constrain sampling to a JSON Schema. */
  readonly supportsGrammar: boolean;

  /**
   * Generate and parse JSON.
   *
   * The caller supplies both the JSON Schema — used to constrain the sampler
   * where supported — and a validator, so schema concerns stay in the feature
   * layer. The grammar guarantees *shape*; the validator still checks
   * *semantics*, because a value can be well-formed and still wrong.
   */
  generateStructured<T>(
    prompt: string,
    jsonSchema: object,
    validate: (value: unknown) => T,
    options?: GenerationOptions,
  ): Promise<StructuredResult<T>>;
}
