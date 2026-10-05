import { LlamaEngine } from '../LlamaEngine';
import { entryAnalysisJsonSchema, validateEntryAnalysis } from '../analysis';
import type { GenerationOptions, GenerationResult } from '../types';

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
