/**
 * Insights across a chosen set of days: the numbers, then the words.
 *
 * `periodStats` is arithmetic over entries (fast, always available).
 * `reflect` hands those numbers and a few entry summaries to the language
 * model for an overview, patterns, suggestions and an outlook — slower, and
 * only on request. Inference goes through the model runtime like every other
 * model call, so it never collides with transcription.
 */
import type { ModelRef, ModelRuntime } from '../core/ai/ModelRuntime';
import {
  buildPeriodPrompt,
  periodReflectionJsonSchema,
  validatePeriodReflection,
  type EntryNote,
  type PeriodReflection,
} from '../core/ai/periodReflection';
import type { JournalEntryRepository } from '../core/db/repositories/JournalEntryRepository';
import { MissingModelError } from '../core/jobs/handlers/types';
import type { JournalEntry } from '../domain/entry/JournalEntry';
import { toSecondPerson } from '../domain/entry/secondPerson';
import {
  computePeriodStats,
  dayKey,
  dayStart,
  type DayKey,
  type InsightEntry,
  type PeriodStats,
} from '../domain/insights/periodInsights';
import { describeVoice } from '../domain/voice/voiceCues';
import type { VoiceFeatures } from '../domain/voice/voiceFeatures';

const DAY_MS = 86_400_000;
/** Same window the entry screen judges a voice against. */
const BASELINE_SIZE = 20;

export interface InsightsServiceDeps {
  entries: JournalEntryRepository;
  runtime: ModelRuntime;
  resolveModel: (kind: 'stt' | 'llm') => ModelRef | null;
}

export interface PeriodData {
  stats: PeriodStats;
  notes: EntryNote[];
}

export class InsightsService {
  constructor(private readonly deps: InsightsServiceDeps) {}

  async periodData(days: readonly DayKey[]): Promise<PeriodData> {
    const sorted = [...new Set(days)].sort();
    if (sorted.length === 0) return { stats: computePeriodStats([], []), notes: [] };

    const from = dayStart(sorted[0]);
    const to = dayStart(sorted[sorted.length - 1]) + DAY_MS;
    const [entries, earlierVoices] = await Promise.all([
      this.deps.entries.listBetween(from, to),
      this.deps.entries.voicesBefore(from, BASELINE_SIZE),
    ]);

    const insightEntries = withEnergy(entries, earlierVoices);
    const stats = computePeriodStats(insightEntries, sorted);

    // The range query spans first to last day; a pick like "Mon + Fri" must
    // not pull in Tuesday's summaries.
    const chosen = new Set(sorted);
    const notes: EntryNote[] = [];
    for (const entry of entries) {
      if (entry.reflection && chosen.has(dayKey(entry.createdAt))) {
        notes.push({
          createdAt: entry.createdAt,
          mood: entry.mood?.value ?? null,
          summary: toSecondPerson(entry.reflection.summary),
        });
      }
    }

    return { stats, notes };
  }

  async reflect(data: PeriodData, periodLabel: string): Promise<PeriodReflection> {
    const model = this.deps.resolveModel('llm');
    if (!model) throw new MissingModelError('llm');

    const result = await this.deps.runtime.useLlm(
      model,
      (engine) =>
        engine.generateStructured(
          buildPeriodPrompt(data.stats, data.notes, periodLabel),
          periodReflectionJsonSchema,
          validatePeriodReflection,
          { maxTokens: 450 },
        ),
      'foreground',
    );
    return result.value;
  }
}

/**
 * Each entry's vocal energy against the voices before it — the same
 * person-relative judgement the entry screen makes, applied in order.
 */
export function withEnergy(
  entries: readonly JournalEntry[],
  earlierVoices: readonly VoiceFeatures[],
): InsightEntry[] {
  // Newest first, as describeVoice's history expects.
  const history = [...earlierVoices];
  return [...entries]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((entry) => {
      const energy = entry.voice ? describeVoice(entry.voice, history.slice(0, BASELINE_SIZE)).energy : null;
      if (entry.voice) history.unshift(entry.voice);
      return {
        createdAt: entry.createdAt,
        durationMs: entry.audio.durationMs,
        mood: entry.mood?.value ?? null,
        topics: entry.topics.map((topic) => topic.name),
        energy,
      };
    });
}
