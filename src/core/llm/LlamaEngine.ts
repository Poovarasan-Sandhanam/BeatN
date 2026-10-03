import { initLlama, type LlamaContext } from 'llama.rn';

import type {
  GenerationMetrics,
  GenerationOptions,
  GenerationResult,
  LocalLLMEngine,
} from './types';

export interface LlamaEngineOptions {
  contextSize?: number;
  /** 0 offloads nothing to the GPU; -1 offloads everything it can. */
  gpuLayers?: number;
  threads?: number;
}

const DEFAULTS: Required<LlamaEngineOptions> = {
  contextSize: 2048,
  gpuLayers: 99,
  threads: 4,
};

export class LlamaEngine implements LocalLLMEngine {
  readonly id = 'llama.rn';
  /** Lets ModelResidencyManager treat this as a LoadableEngine. */
  readonly kind = 'generation' as const;

  private context: LlamaContext | null = null;
  private loadTimeMs = 0;
  private readonly options: Required<LlamaEngineOptions>;

  constructor(options: LlamaEngineOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  get isLoaded(): boolean {
    return this.context !== null;
  }

  get modelLoadTimeMs(): number {
    return this.loadTimeMs;
  }

  get usingGpu(): boolean {
    return this.context?.gpu ?? false;
  }

  get reasonNoGpu(): string {
    return this.context?.reasonNoGPU ?? '';
  }

  get modelDescription(): string {
    return this.context?.model?.desc ?? '';
  }

  async loadModel(modelPath: string, onProgress?: (percent: number) => void): Promise<void> {
    if (this.context) await this.unloadModel();

    const startedAt = Date.now();
    this.context = await initLlama(
      {
        model: modelPath,
        n_ctx: this.options.contextSize,
        n_gpu_layers: this.options.gpuLayers,
        n_threads: this.options.threads,
      },
      onProgress,
    );
    this.loadTimeMs = Date.now() - startedAt;
  }

  async unloadModel(): Promise<void> {
    if (!this.context) return;
    const context = this.context;
    this.context = null;
    await context.release();
  }

  async generate(prompt: string, options: GenerationOptions = {}): Promise<GenerationResult> {
    const context = this.context;
    if (!context) throw new Error('LLM_MODEL_NOT_LOADED');

    const startedAt = Date.now();
    let firstTokenAt = 0;

    const result = await context.completion(
      {
        messages: [{ role: 'user', content: prompt }],
        n_predict: options.maxTokens ?? 256,
        temperature: options.temperature ?? 0.3,
        top_p: options.topP ?? 0.9,
        stop: options.stop,
      },
      (data) => {
        if (firstTokenAt === 0) firstTokenAt = Date.now();
        options.onToken?.(data.token);
      },
    );

    const totalTimeMs = Date.now() - startedAt;
    const metrics: GenerationMetrics = {
      timeToFirstTokenMs: firstTokenAt === 0 ? totalTimeMs : firstTokenAt - startedAt,
      totalTimeMs,
      promptTokens: result.timings?.prompt_n ?? result.tokens_evaluated ?? 0,
      predictedTokens: result.timings?.predicted_n ?? result.tokens_predicted ?? 0,
      tokensPerSecond: result.timings?.predicted_per_second ?? 0,
    };

    return { text: (result.text ?? result.content ?? '').trim(), metrics };
  }

  async generateStructured<T>(
    prompt: string,
    validate: (value: unknown) => T,
    options: GenerationOptions = {},
  ) {
    const maxAttempts = 2;
    let lastError: unknown;
    let lastRaw = '';
    let metrics: GenerationMetrics | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      // A retry gets a blunter instruction rather than the same prompt again.
      const attemptPrompt =
        attempt === 1
          ? prompt
          : `${prompt}\n\nYour previous reply was not valid JSON. Reply with the JSON object only. No prose, no markdown fence.`;

      const generated = await this.generate(attemptPrompt, {
        ...options,
        temperature: attempt === 1 ? (options.temperature ?? 0.2) : 0,
      });

      lastRaw = generated.text;
      metrics = generated.metrics;

      try {
        const parsed = JSON.parse(extractJsonObject(generated.text));
        return { value: validate(parsed), raw: lastRaw, metrics, attempts: attempt };
      } catch (error) {
        lastError = error;
      }
    }

    const error = new Error('AI_STRUCTURED_OUTPUT_INVALID');
    (error as Error & { cause?: unknown }).cause = lastError;
    throw error;
  }
}

/**
 * Small models routinely wrap JSON in prose or a markdown fence. Pull out the
 * outermost balanced object rather than trusting the whole reply.
 */
export function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();

  const start = candidate.indexOf('{');
  if (start === -1) return candidate;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < candidate.length; i += 1) {
    const char = candidate[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }

  return candidate.slice(start);
}
