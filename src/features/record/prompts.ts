/**
 * Starters for a blank mind. Open questions, never clinical ones: this is a
 * journal, not an intake form.
 */
export const PROMPTS = [
  'What’s on your mind right now?',
  'What took up most of your head today?',
  'One thing that went better than expected.',
  'Who did you think about today?',
  'What are you looking forward to?',
  'Something you keep putting off — and why.',
  'What would make tomorrow a good day?',
  'What surprised you this week?',
  'How does your body feel right now?',
  'What are you grateful for today?',
] as const;

/** The prompt after `index`, wrapping round. */
export function nextPromptIndex(index: number): number {
  return (index + 1) % PROMPTS.length;
}
