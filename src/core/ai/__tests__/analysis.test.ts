import { extractJsonObject } from '../LlamaEngine';
import { buildAnalysisPrompt, validateEntryAnalysis } from '../analysis';

describe('extractJsonObject', () => {
  it('returns a bare object unchanged', () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it('unwraps a ```json fence', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('unwraps an unlabelled fence', () => {
    expect(extractJsonObject('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips prose around the object', () => {
    expect(extractJsonObject('Sure! Here it is:\n{"a":1}\nHope that helps.')).toBe('{"a":1}');
  });

  it('keeps nested objects intact', () => {
    const json = '{"a":{"b":{"c":1}},"d":2}';
    expect(extractJsonObject(`noise ${json} more noise`)).toBe(json);
  });

  it('does not stop at a brace inside a string', () => {
    const json = '{"a":"} not the end","b":1}';
    expect(extractJsonObject(json)).toBe(json);
  });

  it('does not stop at an escaped quote', () => {
    const json = '{"a":"say \\"} hi\\"","b":1}';
    expect(extractJsonObject(json)).toBe(json);
  });

  it('returns the text unchanged when there is no object', () => {
    expect(extractJsonObject('no json here')).toBe('no json here');
  });
});

describe('validateEntryAnalysis', () => {
  const valid = {
    summary: 'You finished the migration you had been putting off.',
    mood: 'calm',
    moodConfidence: 0.7,
    topics: [{ name: 'work', confidence: 0.9 }],
  };

  it('accepts a well-formed analysis', () => {
    expect(validateEntryAnalysis(valid)).toEqual(valid);
  });

  it('accepts an empty topic list', () => {
    expect(validateEntryAnalysis({ ...valid, topics: [] }).topics).toEqual([]);
  });

  it('accepts "unknown" so the model is not forced to classify', () => {
    expect(validateEntryAnalysis({ ...valid, mood: 'unknown' }).mood).toBe('unknown');
  });

  it('rejects a mood outside the allowed set', () => {
    expect(() => validateEntryAnalysis({ ...valid, mood: 'depressed' })).toThrow();
  });

  it('rejects a confidence outside 0..1', () => {
    expect(() => validateEntryAnalysis({ ...valid, moodConfidence: 1.4 })).toThrow();
  });

  it('rejects an empty summary', () => {
    expect(() => validateEntryAnalysis({ ...valid, summary: '' })).toThrow();
  });

  it('rejects more than six topics', () => {
    const topics = Array.from({ length: 7 }, (_, i) => ({ name: `t${i}`, confidence: 0.5 }));
    expect(() => validateEntryAnalysis({ ...valid, topics })).toThrow();
  });

  it('rejects a missing field', () => {
    const { mood, ...withoutMood } = valid;
    void mood;
    expect(() => validateEntryAnalysis(withoutMood)).toThrow();
  });

  it('rejects a non-object', () => {
    expect(() => validateEntryAnalysis('nope')).toThrow();
  });
});

describe('buildAnalysisPrompt', () => {
  it('embeds the transcript', () => {
    expect(buildAnalysisPrompt('I went for a walk.')).toContain('I went for a walk.');
  });

  it('lists every allowed mood so the model cannot invent one', () => {
    const prompt = buildAnalysisPrompt('x');
    for (const mood of ['calm', 'stressed', 'unknown']) {
      expect(prompt).toContain(mood);
    }
  });

  it('tells the model not to diagnose', () => {
    expect(buildAnalysisPrompt('x')).toContain('Do not diagnose');
  });
});
