import { z } from 'zod';

/**
 * The structured reflection BeatN derives from a transcript. Mood is a
 * personalisation signal for the UI, never a clinical claim, so the schema
 * carries a confidence and allows "unknown".
 */
export const MOODS = [
  'calm',
  'happy',
  'excited',
  'reflective',
  'neutral',
  'tired',
  'stressed',
  'sad',
  'mixed',
  'unknown',
] as const;

export const EntryAnalysisSchema = z.object({
  summary: z.string().min(1).max(600),
  mood: z.enum(MOODS),
  moodConfidence: z.number().min(0).max(1),
  topics: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(6),
});

export type EntryAnalysis = z.infer<typeof EntryAnalysisSchema>;

/**
 * The same schema as JSON Schema, for constraining the sampler.
 *
 * Derived from the Zod schema rather than hand-written, so the grammar and the
 * validator can never drift apart. llama.cpp compiles this to GBNF; the
 * `mood` enum is the valuable part, because it makes an invented mood
 * impossible to emit rather than something to reject afterwards.
 */
export const entryAnalysisJsonSchema: object = z.toJSONSchema(EntryAnalysisSchema);

export function validateEntryAnalysis(value: unknown): EntryAnalysis {
  return EntryAnalysisSchema.parse(value);
}

/**
 * Kept deliberately terse: small quantized models follow short, concrete
 * instructions far more reliably than long ones.
 */
export function buildAnalysisPrompt(transcript: string, voiceSummary: string | null = null): string {
  // The voice decides energy, the words decide direction. Acoustic arousal is
  // well established; reading positive vs negative from tone alone is not.
  const voice = voiceSummary
    ? [
        '',
        `How they sounded: ${voiceSummary}`,
        `Use how they sounded to judge energy (tired or calm when low; excited or stressed when high).
Use the words to judge whether the feeling is positive or negative.
If the words and the voice disagree, trust the words and lower moodConfidence.
Never mention the voice measurements in the summary.`,
      ]
    : [];
  return [
    'You analyse a personal journal entry. Reply with one JSON object and nothing else.',
    '',
    'Schema:',
    '{"summary": string, "mood": string, "moodConfidence": number, "topics": [{"name": string, "confidence": number}]}',
    '',
    `Rules:
- summary: one or two sentences, second person, under 40 words.
- mood: exactly one of ${MOODS.join(', ')}.
- moodConfidence and confidence: between 0 and 1.
- topics: at most 4, lowercase single words or short phrases.
- Use "unknown" for mood if the entry gives no clear signal.
- Do not diagnose. Describe only what the entry says.`,
    ...voice,
    '',
    'Journal entry:',
    '"""',
    transcript,
    '"""',
    '',
    'JSON:',
  ].join('\n');
}
