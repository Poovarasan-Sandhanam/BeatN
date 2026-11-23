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
  /** One small, practical thing to try today. Empty when nothing fits. */
  suggestion: z.string().max(200),
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

/**
 * Validates a model reply, first repairing the near-misses small models make
 * without a grammar: a mood outside the list ("content", "Happy"), a confidence
 * of 1.2 or "0.7", too many topics, an over-long summary. Anything that cannot
 * be repaired — no summary at all, not an object — still fails, and the
 * engine retries once.
 */
export function validateEntryAnalysis(value: unknown): EntryAnalysis {
  return EntryAnalysisSchema.parse(normaliseEntryAnalysis(value));
}

const clamp01 = (value: unknown, fallback: number): number => {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
};

export function normaliseEntryAnalysis(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const raw = value as Record<string, unknown>;

  const moodText = typeof raw.mood === 'string' ? raw.mood.trim().toLowerCase() : '';
  const knownMood = (MOODS as readonly string[]).includes(moodText);

  const topics = Array.isArray(raw.topics) ? raw.topics : [];
  return {
    summary: typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 600) : raw.summary,
    // An invented mood becomes "unknown" — honest — rather than failing the entry.
    mood: knownMood ? moodText : 'unknown',
    moodConfidence: knownMood ? clamp01(raw.moodConfidence, 0.5) : 0,
    // Optional for the model: an empty suggestion is better than an invented one.
    suggestion: typeof raw.suggestion === 'string' ? raw.suggestion.trim().slice(0, 200) : '',
    topics: topics
      .map((topic) =>
        typeof topic === 'string'
          ? { name: topic, confidence: 0.5 }
          : (topic as Record<string, unknown> | null),
      )
      .filter((topic): topic is Record<string, unknown> => !!topic && typeof topic.name === 'string')
      .map((topic) => ({
        name: (topic.name as string).trim().toLowerCase().slice(0, 40),
        confidence: clamp01(topic.confidence, 0.5),
      }))
      .filter((topic) => topic.name.length > 0)
      .slice(0, 6),
  };
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
    '{"summary": string, "mood": string, "moodConfidence": number, "topics": [{"name": string, "confidence": number}], "suggestion": string}',
    '',
    `Rules:
- summary: one or two sentences, under 40 words, spoken to them: start with "You". Never write "the person" or "the user". Example: "You're planning a trip and feel excited about the new job."
- mood: exactly one of ${MOODS.join(', ')}.
- moodConfidence and confidence: between 0 and 1.
- topics: at most 4, lowercase single words or short phrases.
- suggestion: one small, practical thing they could try today, grounded in what they said, second person, under 25 words. Kind, never preachy. Empty string if nothing fits.
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
