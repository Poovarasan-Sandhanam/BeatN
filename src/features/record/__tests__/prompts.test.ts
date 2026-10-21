import { PROMPTS, nextPromptIndex } from '../prompts';

describe('prompts', () => {
  it('has no duplicates', () => {
    expect(new Set(PROMPTS).size).toBe(PROMPTS.length);
  });

  it('cycles through every prompt and wraps round', () => {
    expect(nextPromptIndex(0)).toBe(1);
    expect(nextPromptIndex(PROMPTS.length - 1)).toBe(0);
  });
});
