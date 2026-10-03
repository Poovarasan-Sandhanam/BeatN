/**
 * The AI ports.
 *
 * Feature code depends on these interfaces and never on `whisper.rn`,
 * `llama.rn`, or any future runtime. Swapping llama.cpp for Apple Foundation
 * Models, Gemini Nano, or a hosted model means writing one adapter — not
 * touching a single screen.
 *
 * Every engine is `LoadableEngine`, because on a phone a model is a large file
 * that has to be loaded and, crucially, *unloaded*. See ModelResidencyManager.
 */

export type ModelKind = 'stt' | 'generation' | 'embedding' | 'rerank';

export interface LoadableEngine {
  readonly id: string;
  readonly kind: ModelKind;
  readonly isLoaded: boolean;

  loadModel(modelPath: string, onProgress?: (percent: number) => void): Promise<void>;
  unloadModel(): Promise<void>;
}

// ── Speech to text ──────────────────────────────────────────────────────────

export interface TranscriptionOptions {
  language?: string;
  maxThreads?: number;
  translate?: boolean;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  durationMs: number;
  processingTimeMs: number;
}

export interface SpeechToTextEngine extends LoadableEngine {
  readonly kind: 'stt';
  transcribe(audioPath: string, options?: TranscriptionOptions): Promise<TranscriptionResult>;
}

// ── Text generation ─────────────────────────────────────────────────────────

export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

export interface GenerationMetrics {
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
  /** True when the sampler was grammar-constrained (so JSON could not be malformed). */
  grammarConstrained: boolean;
}

export interface TextGenerationEngine extends LoadableEngine {
  readonly kind: 'generation';

  /** True when the runtime can constrain sampling to a JSON Schema. */
  readonly supportsGrammar: boolean;

  generate(prompt: string, options?: GenerationOptions): Promise<GenerationResult>;

  /**
   * Generate JSON. The caller supplies both the JSON Schema (used to constrain
   * the sampler where supported) and a validator, so schema concerns stay in
   * the feature layer.
   *
   * Grammar guarantees *shape*; the validator still checks *semantics* — an
   * enum member can be well-formed and still wrong.
   */
  generateStructured<T>(
    prompt: string,
    jsonSchema: object,
    validate: (value: unknown) => T,
    options?: GenerationOptions,
  ): Promise<StructuredResult<T>>;
}

// ── Embeddings ──────────────────────────────────────────────────────────────

export interface EmbeddingEngine extends LoadableEngine {
  readonly kind: 'embedding';

  /**
   * Vector width. Fixed for the lifetime of an index: `vec0` tables declare
   * their dimensionality at creation, and changing the embedding model
   * invalidates every stored vector. See SYSTEM_DESIGN.md §4.
   */
  readonly dimensions: number;

  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

// ── Reranking ───────────────────────────────────────────────────────────────

export interface RerankHit {
  index: number;
  score: number;
}

/**
 * Second stage of retrieval: cheap recall from FTS5 + vectors, then precise
 * reordering here. Optional — the pipeline degrades to fusion-only ranking
 * when no rerank model is resident.
 */
export interface RerankEngine extends LoadableEngine {
  readonly kind: 'rerank';
  rerank(query: string, documents: string[]): Promise<RerankHit[]>;
}
