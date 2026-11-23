import { initLlama, type LlamaContext } from 'llama.rn';

import type {
  GenerationMetrics,
  GenerationOptions,
  GenerationResult,
  LocalLLMEngine,
  StructuredResult,
} from './llmTypes';

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
  /** Kept so the model can be reloaded on the CPU if the GPU path fails. */
  private modelPath: string | null = null;
  /**
   * Set after a GPU run fails. Sticky for the life of the engine: a device
   * whose GPU path broke once (the iOS simulator, older Metal drivers) will
   * break again, and a reload costs seconds.
   */
  private cpuOnly = false;
  /**
   * Whether the current native context has run a completion. Each context
   * runs exactly one, then is replaced — see `generate` for why.
   */
  private contextUsed = false;

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

  /**
   * Off. Grammar-constrained sampling is the riskiest path into llama.rn's
   * sampler setup (see `generate`); structured output is validated and
   * normalised in JS instead, which costs at most one retry.
   */
  get supportsGrammar(): boolean {
    return false;
  }

  async loadModel(modelPath: string, onProgress?: (percent: number) => void): Promise<void> {
    if (this.context) await this.unloadModel();

    const startedAt = Date.now();
    this.modelPath = modelPath;
    this.context = await initLlama(
      {
        model: modelPath,
        n_ctx: this.options.contextSize,
        n_gpu_layers: this.cpuOnly ? 0 : this.options.gpuLayers,
        n_threads: this.options.threads,
      },
      onProgress,
    );
    this.contextUsed = false;
    this.loadTimeMs = Date.now() - startedAt;
  }

  async unloadModel(): Promise<void> {
    if (!this.context) return;
    const context = this.context;
    this.context = null;
    await context.release();
  }

  /**
   * Runs one completion on a fresh native context.
   *
   * Works around a crash in llama.rn 0.12.9 (prebuilt, so not patchable here):
   * `initSampling()` frees the previous sampler and then builds a new one, but
   * if building throws, the freed pointer stays in place. The next completion
   * — or releasing the context — frees it again and the app aborts with
   * "pointer being freed was not allocated". A context that runs only one
   * completion never has a previous sampler to leave dangling, so the bug is
   * unreachable. The model is memory-mapped, so a new context is cheap.
   */
  async generate(prompt: string, options: GenerationOptions = {}): Promise<GenerationResult> {
    if (this.contextUsed && this.modelPath) await this.loadModel(this.modelPath);
    try {
      return await this.complete(prompt, options);
    } catch (error) {
      // GPU offload is the least portable part of llama.cpp. If it fails,
      // retry once on the CPU: slower, but an answer beats a failed entry.
      if (this.cpuOnly || this.options.gpuLayers === 0 || !this.modelPath) throw error;
      this.cpuOnly = true;
      await this.loadModel(this.modelPath);
      return this.complete(prompt, options);
    }
  }

  private async complete(prompt: string, options: GenerationOptions): Promise<GenerationResult> {
    const context = this.context;
    if (!context) throw new Error('LLM_MODEL_NOT_LOADED');
    // Marked before the call, not after: a completion that throws may have
    // poisoned the context, and must never be followed by another on it.
    this.contextUsed = true;

    const startedAt = Date.now();
    let firstTokenAt = 0;

    const result = await context.completion(
      {
        messages: [{ role: 'user', content: prompt }],
        n_predict: options.maxTokens ?? 256,
        temperature: options.temperature ?? 0.3,
        top_p: options.topP ?? 0.9,
        stop: options.stop,
        // Converted to a GBNF grammar by llama.cpp. With this set, the
        // sampler cannot emit a token that would break the schema.
        ...(options.jsonSchema ? { json_schema: JSON.stringify(options.jsonSchema) } : {}),
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
    _jsonSchema: object,
    validate: (value: unknown) => T,
    options: GenerationOptions = {},
  ): Promise<StructuredResult<T>> {
    const maxAttempts = 2;
    let lastError: unknown;
    let lastRaw = '';
    let metrics: GenerationMetrics | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      // No grammar (see `supportsGrammar`). Attempt 2, if needed, runs at
      // temperature 0 with a blunter instruction.
      const firstAttempt = attempt === 1;
      // The nudge only makes sense if there was a reply to correct.
      const attemptPrompt = firstAttempt || lastRaw === ''
        ? prompt
        : `${prompt}\n\nYour previous reply was not valid. Reply with the JSON object only. No prose, no markdown fence.`;

      let generated: GenerationResult;
      try {
        generated = await this.generate(attemptPrompt, {
          ...options,
          temperature: firstAttempt ? (options.temperature ?? 0.2) : 0,
        });
      } catch (error) {
        // A native error on the first attempt gets one more try — on a fresh
        // context, which `generate` guarantees. A second one is final.
        if (!firstAttempt) throw error;
        lastError = error;
        continue;
      }

      lastRaw = generated.text;
      metrics = generated.metrics;

      try {
        const parsed = JSON.parse(extractJsonObject(generated.text));
        return {
          value: validate(parsed),
          raw: lastRaw,
          metrics,
          attempts: attempt,
          grammarConstrained: false,
        };
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
