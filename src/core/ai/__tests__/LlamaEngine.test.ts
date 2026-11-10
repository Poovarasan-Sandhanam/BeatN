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
      ['mood', 'moodConfidence', 'summary', 'topics'].sort(),
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
  it('constrains the sampler with the schema on the first attempt', async () => {
    const { engine, calls } = engineReturning(VALID);

    const result = await engine.generateStructured(
      'prompt',
      entryAnalysisJsonSchema,
      validateEntryAnalysis,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].options.jsonSchema).toBe(entryAnalysisJsonSchema);
    expect(result.grammarConstrained).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.value.mood).toBe('reflective');
  });

  it('drops the grammar and goes to temperature 0 on the retry', async () => {
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

  it('rejects output that is well-formed but semantically wrong', async () => {
    // Shape is fine; "ecstatic" is not a permitted mood.
    const bogus = JSON.stringify({
      summary: 'x',
      mood: 'ecstatic',
      moodConfidence: 0.5,
      topics: [],
    });
    const { engine } = engineReturning(bogus, bogus);

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

  it('reports grammar support', () => {
    expect(new LlamaEngine().supportsGrammar).toBe(true);
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
    expect(generate.mock.calls[1][1]?.jsonSchema).toBeUndefined();
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
