import { initLlama as initLlamaImport } from 'llama.rn';

import { LlamaEngine } from '../LlamaEngine';
import { entryAnalysisJsonSchema, validateEntryAnalysis } from '../analysis';
import type { GenerationOptions, GenerationResult } from '../llmTypes';

const VALID = JSON.stringify({
  summary: 'You are weighing up a change of direction.',
  mood: 'reflective',
  moodConfidence: 0.7,
  topics: [{ name: 'career', confidence: 0.9 }],
});

const metrics = {
  timeToFirstTokenMs: 10,
  totalTimeMs: 100,
  promptTokens: 50,
  predictedTokens: 40,
  tokensPerSecond: 12,
};

/** Captures what each attempt asked the sampler for. */
function engineReturning(...replies: string[]) {
  const engine = new LlamaEngine();
  const calls: { prompt: string; options: GenerationOptions }[] = [];
  let index = 0;

  jest
    .spyOn(engine, 'generate')
    .mockImplementation(async (prompt: string, options: GenerationOptions = {}) => {
      calls.push({ prompt, options });
      const text = replies[Math.min(index, replies.length - 1)];
      index += 1;
      return { text, metrics } satisfies GenerationResult;
    });

  return { engine, calls };
}

describe('entryAnalysisJsonSchema', () => {
  it('constrains mood to the allowed values', () => {
    const schema = entryAnalysisJsonSchema as {
      properties: { mood: { enum: string[] } };
    };
    expect(schema.properties.mood.enum).toContain('reflective');
    expect(schema.properties.mood.enum).toContain('unknown');
    expect(schema.properties.mood.enum).not.toContain('ecstatic');
  });

  it('requires every field the validator requires', () => {
    const schema = entryAnalysisJsonSchema as { required: string[] };
    expect(schema.required.sort()).toEqual(
      ['mood', 'moodConfidence', 'suggestion', 'summary', 'topics'].sort(),
    );
  });

  it('forbids extra properties, so the model cannot invent fields', () => {
    expect((entryAnalysisJsonSchema as { additionalProperties: boolean }).additionalProperties).toBe(
      false,
    );
  });

  it('serialises for llama.cpp without throwing', () => {
    expect(() => JSON.stringify(entryAnalysisJsonSchema)).not.toThrow();
  });
});

describe('generateStructured', () => {
  it('never asks the native sampler for a grammar — that path can crash llama.rn', async () => {
    const { engine, calls } = engineReturning(VALID);

    const result = await engine.generateStructured(
      'prompt',
      entryAnalysisJsonSchema,
      validateEntryAnalysis,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].options.jsonSchema).toBeUndefined();
    expect(result.grammarConstrained).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.value.mood).toBe('reflective');
  });

  it('goes to temperature 0 with a blunter instruction on the retry', async () => {
    const { engine, calls } = engineReturning('not json at all', VALID);

    const result = await engine.generateStructured(
      'prompt',
      entryAnalysisJsonSchema,
      validateEntryAnalysis,
    );

    expect(calls).toHaveLength(2);
    expect(calls[1].options.jsonSchema).toBeUndefined();
    expect(calls[1].options.temperature).toBe(0);
    expect(calls[1].prompt).toContain('JSON object only');
    expect(result.attempts).toBe(2);
    expect(result.grammarConstrained).toBe(false);
  });

  it('repairs an invented mood to "unknown" instead of failing the entry', async () => {
    const invented = JSON.stringify({ summary: 'x', mood: 'ecstatic', moodConfidence: 0.9, topics: [] });
    const { engine, calls } = engineReturning(invented);

    const result = await engine.generateStructured(
      'prompt',
      entryAnalysisJsonSchema,
      validateEntryAnalysis,
    );
    expect(calls).toHaveLength(1);
    expect(result.value.mood).toBe('unknown');
    expect(result.value.moodConfidence).toBe(0);
  });

  it('rejects output with nothing usable in it', async () => {
    const empty = JSON.stringify({ mood: 'calm', topics: [] });
    const { engine } = engineReturning(empty, empty);

    await expect(
      engine.generateStructured('prompt', entryAnalysisJsonSchema, validateEntryAnalysis),
    ).rejects.toThrow('AI_STRUCTURED_OUTPUT_INVALID');
  });

  it('keeps the underlying parse failure as the error cause', async () => {
    const { engine } = engineReturning('nope', 'still nope');

    await expect(
      engine.generateStructured('prompt', entryAnalysisJsonSchema, validateEntryAnalysis),
    ).rejects.toMatchObject({ cause: expect.anything() });
  });

  it('still unwraps a fenced object, for runtimes without grammar support', async () => {
    const { engine } = engineReturning(`Here you go:\n\`\`\`json\n${VALID}\n\`\`\``);

    const result = await engine.generateStructured(
      'prompt',
      entryAnalysisJsonSchema,
      validateEntryAnalysis,
    );
    expect(result.value.summary).toContain('weighing up');
  });

  it('reports no grammar support', () => {
    expect(new LlamaEngine().supportsGrammar).toBe(false);
  });
});

describe('generateStructured when the native layer throws', () => {
  it('falls through to the unconstrained attempt if the grammar run throws', async () => {
    const engine = new LlamaEngine();
    const generate = jest
      .spyOn(engine, 'generate')
      .mockRejectedValueOnce(new Error('std::exception'))
      .mockResolvedValueOnce({ text: VALID, metrics });

    const result = await engine.generateStructured(
      'prompt',
      entryAnalysisJsonSchema,
      validateEntryAnalysis,
    );

    expect(result.attempts).toBe(2);
    expect(result.grammarConstrained).toBe(false);
    // No reply came back, so the retry repeats the prompt rather than scolding.
    expect(generate.mock.calls[1][0]).toBe('prompt');
  });

  it('gives up with the native error if the unconstrained attempt throws too', async () => {
    const engine = new LlamaEngine();
    jest.spyOn(engine, 'generate').mockRejectedValue(new Error('std::exception'));

    await expect(
      engine.generateStructured('prompt', entryAnalysisJsonSchema, validateEntryAnalysis),
    ).rejects.toThrow('std::exception');
  });
});

describe('GPU fallback', () => {
  // The same module instance LlamaEngine imports (mapped to jest/mocks/llama.rn.js).
  const initLlama = initLlamaImport as unknown as jest.Mock;

  /** A llama.rn context whose completion fails while GPU layers are in use. */
  function contextFor(params: { n_gpu_layers: number }) {
    return {
      gpu: params.n_gpu_layers > 0,
      release: jest.fn(async () => {}),
      completion: jest.fn(async () => {
        if (params.n_gpu_layers > 0) throw new Error('std::exception');
        return { text: 'ok', timings: { predicted_n: 1 } };
      }),
    };
  }

  beforeEach(() => {
    initLlama.mockReset();
    initLlama.mockImplementation(async (params: { n_gpu_layers: number }) => contextFor(params));
  });

  it('reloads on the CPU and retries once when the GPU run fails', async () => {
    const engine = new LlamaEngine({ gpuLayers: 99 });
    await engine.loadModel('/models/llm.gguf');

    const result = await engine.generate('hello');

    expect(result.text).toBe('ok');
    expect(initLlama.mock.calls.map(([p]) => p.n_gpu_layers)).toEqual([99, 0]);
  });

  it('stays on the CPU afterwards instead of retrying the GPU every time', async () => {
    const engine = new LlamaEngine({ gpuLayers: 99 });
    await engine.loadModel('/models/llm.gguf');
    await engine.generate('first');

    await engine.loadModel('/models/llm.gguf');

    expect(initLlama.mock.calls.at(-1)?.[0].n_gpu_layers).toBe(0);
  });

  it('does not retry when already on the CPU', async () => {
    initLlama.mockImplementation(async () => ({
      gpu: false,
      release: jest.fn(async () => {}),
      completion: jest.fn(async () => {
        throw new Error('CONTEXT_FULL');
      }),
    }));
    const engine = new LlamaEngine({ gpuLayers: 0 });
    await engine.loadModel('/models/llm.gguf');

    await expect(engine.generate('hello')).rejects.toThrow('CONTEXT_FULL');
    expect(initLlama).toHaveBeenCalledTimes(1);
  });
});

describe('one completion per native context (llama.rn double-free workaround)', () => {
  const initLlama = initLlamaImport as unknown as jest.Mock;
  let contexts: { completion: jest.Mock; release: jest.Mock }[];

  beforeEach(() => {
    contexts = [];
    initLlama.mockReset();
    initLlama.mockImplementation(async () => {
      const context = {
        gpu: false,
        release: jest.fn(async () => {}),
        completion: jest.fn(async () => ({ text: VALID, timings: { predicted_n: 1 } })),
      };
      contexts.push(context);
      return context;
    });
  });

  it('runs every completion on a context that has never run one before', async () => {
    const engine = new LlamaEngine({ gpuLayers: 0 });
    await engine.loadModel('/models/llm.gguf');

    await engine.generate('one');
    await engine.generate('two');
    await engine.generate('three');

    expect(contexts).toHaveLength(3);
    for (const context of contexts) expect(context.completion).toHaveBeenCalledTimes(1);
    // Each used context is released before the next exists.
    expect(contexts[0].release).toHaveBeenCalled();
    expect(contexts[1].release).toHaveBeenCalled();
  });

  it('never reuses a context whose completion threw', async () => {
    const engine = new LlamaEngine({ gpuLayers: 0 });
    await engine.loadModel('/models/llm.gguf');
    contexts[0].completion.mockRejectedValueOnce(new Error('std::exception'));

    await expect(engine.generate('poisoned')).rejects.toThrow('std::exception');
    await engine.generate('next');

    expect(contexts[0].completion).toHaveBeenCalledTimes(1);
    expect(contexts[1].completion).toHaveBeenCalledTimes(1);
  });

  it('retries a structured request on a fresh context after a native error', async () => {
    const engine = new LlamaEngine({ gpuLayers: 0 });
    await engine.loadModel('/models/llm.gguf');
    contexts[0].completion.mockRejectedValueOnce(new Error('std::exception'));

    const result = await engine.generateStructured(
      'prompt',
      entryAnalysisJsonSchema,
      validateEntryAnalysis,
    );

    expect(result.attempts).toBe(2);
    expect(contexts).toHaveLength(2);
    expect(contexts[1].completion).toHaveBeenCalledTimes(1);
  });
});
