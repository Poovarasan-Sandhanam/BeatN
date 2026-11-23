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
    // No suggestion from the model is fine: it becomes an empty one, never invented.
    expect(validateEntryAnalysis(valid)).toEqual({ ...valid, suggestion: '' });
  });

  it('keeps a suggestion, trimmed', () => {
    expect(validateEntryAnalysis({ ...valid, suggestion: '  Take a short walk. ' }).suggestion).toBe(
      'Take a short walk.',
    );
  });

  it('accepts an empty topic list', () => {
    expect(validateEntryAnalysis({ ...valid, topics: [] }).topics).toEqual([]);
  });

  it('accepts "unknown" so the model is not forced to classify', () => {
    expect(validateEntryAnalysis({ ...valid, mood: 'unknown' }).mood).toBe('unknown');
  });

  it('never stores a mood outside the allowed set — least of all a clinical one', () => {
    const result = validateEntryAnalysis({ ...valid, mood: 'depressed' });
    expect(result.mood).toBe('unknown');
    expect(result.moodConfidence).toBe(0);
  });

  it('keeps a confidence within 0..1', () => {
    expect(validateEntryAnalysis({ ...valid, moodConfidence: 1.4 }).moodConfidence).toBe(1);
    expect(validateEntryAnalysis({ ...valid, moodConfidence: -0.2 }).moodConfidence).toBe(0);
  });

  it('rejects an empty summary', () => {
    expect(() => validateEntryAnalysis({ ...valid, summary: '' })).toThrow();
  });

  it('keeps at most six topics', () => {
    const topics = Array.from({ length: 7 }, (_, i) => ({ name: `t${i}`, confidence: 0.5 }));
    expect(validateEntryAnalysis({ ...valid, topics }).topics).toHaveLength(6);
  });

  it('treats a missing mood as unknown, but a missing summary as a failure', () => {
    const { mood, ...withoutMood } = valid;
    void mood;
    expect(validateEntryAnalysis(withoutMood).mood).toBe('unknown');

    const { summary, ...withoutSummary } = valid;
    void summary;
    expect(() => validateEntryAnalysis(withoutSummary)).toThrow();
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

describe('buildAnalysisPrompt with voice', () => {
  it('adds how they sounded, and how to weigh it', () => {
    const prompt = buildAnalysisPrompt('I am fine.', 'quieter than usual. Overall vocal energy: low.');
    expect(prompt).toContain('How they sounded: quieter than usual');
    expect(prompt).toContain('Use the words to judge whether the feeling is positive or negative.');
    expect(prompt).toContain('Never mention the voice measurements');
    // The entry itself still comes last, after every instruction.
    expect(prompt.indexOf('How they sounded')).toBeLessThan(prompt.indexOf('I am fine.'));
  });

  it('is unchanged in shape without a voice', () => {
    expect(buildAnalysisPrompt('x')).not.toContain('How they sounded');
  });
});

describe('validateEntryAnalysis repairs near-misses', () => {
  const base = { summary: 'You walked.', mood: 'calm', moodConfidence: 0.6, topics: [] };

  it('accepts a mood in any case', () => {
    expect(validateEntryAnalysis({ ...base, mood: ' Happy ' }).mood).toBe('happy');
  });

  it('turns an invented mood into "unknown" with no confidence', () => {
    const result = validateEntryAnalysis({ ...base, mood: 'content', moodConfidence: 0.9 });
    expect(result).toMatchObject({ mood: 'unknown', moodConfidence: 0 });
  });

  it('clamps and parses confidences', () => {
    expect(validateEntryAnalysis({ ...base, moodConfidence: 1.4 }).moodConfidence).toBe(1);
    expect(validateEntryAnalysis({ ...base, moodConfidence: '0.7' }).moodConfidence).toBe(0.7);
    expect(validateEntryAnalysis({ ...base, moodConfidence: 'high' }).moodConfidence).toBe(0.5);
  });

  it('tidies topics: strings allowed, lowercased, empties dropped, at most six', () => {
    const result = validateEntryAnalysis({
      ...base,
      topics: ['Work', { name: ' Sleep ', confidence: 2 }, { name: '' }, null, 'a', 'b', 'c', 'd', 'e'],
    });
    expect(result.topics[0]).toEqual({ name: 'work', confidence: 0.5 });
    expect(result.topics[1]).toEqual({ name: 'sleep', confidence: 1 });
    expect(result.topics).toHaveLength(6);
  });

  it('trims an over-long summary instead of failing', () => {
    expect(validateEntryAnalysis({ ...base, summary: 'x'.repeat(900) }).summary).toHaveLength(600);
  });

  it('still fails when there is no summary to show', () => {
    expect(() => validateEntryAnalysis({ ...base, summary: undefined })).toThrow();
    expect(() => validateEntryAnalysis('just text')).toThrow();
  });
});
