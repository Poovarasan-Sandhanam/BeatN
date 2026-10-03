/**
 * Row ↔ domain mapping.
 *
 * Pure, and therefore the part of the persistence layer that can be tested
 * without a device. Rows are treated as untrusted: a value that is not a legal
 * domain value raises `RowMappingError` rather than being cast through, so a
 * missed migration surfaces as a loud error instead of a corrupt entry.
 */

import {
  MOODS,
  PROCESSING_STATES,
  type AudioRef,
  type EntityKind,
  type JournalEntry,
  type MentionedEntity,
  type Mood,
  type ProcessingState,
  type Provenance,
  type ScoredTopic,
} from '../../domain/entry/JournalEntry';
import { RowMappingError } from './types';

const TABLE = 'journal_entries';
const ENTITY_KINDS: readonly EntityKind[] = ['person', 'place', 'organisation'];

export interface JournalEntryRow {
  id: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;

  audio_uri: string | null;
  audio_duration_ms: number;
  audio_sample_rate: number;
  audio_channels: number;
  audio_byte_length: number;

  transcript_text: string | null;
  transcript_language: string | null;
  transcript_model_id: string | null;
  transcript_model_version: string | null;
  transcript_generated_at: number | null;

  title: string | null;
  summary: string | null;
  reflection_model_id: string | null;
  reflection_model_version: string | null;
  reflection_prompt_version: string | null;
  reflection_generated_at: number | null;

  mood: string | null;
  mood_confidence: number | null;
  mood_model_id: string | null;
  mood_model_version: string | null;
  mood_generated_at: number | null;

  processing_state: string;
  processing_error: string | null;

  is_favourite: number;
  version: number;
  device_id: string;
}

export interface TopicRow {
  entry_id: string;
  name: string;
  confidence: number;
}

export interface EntityRow {
  entry_id: string;
  kind: string;
  name: string;
  confidence: number;
}

export function parseProcessingState(value: string): ProcessingState {
  if ((PROCESSING_STATES as readonly string[]).includes(value)) return value as ProcessingState;
  throw new RowMappingError(TABLE, 'processing_state', value);
}

export function parseMood(value: string): Mood {
  if ((MOODS as readonly string[]).includes(value)) return value as Mood;
  throw new RowMappingError(TABLE, 'mood', value);
}

export function parseEntityKind(value: string): EntityKind {
  if (ENTITY_KINDS.includes(value as EntityKind)) return value as EntityKind;
  throw new RowMappingError('entry_entities', 'kind', value);
}

/** SQLite has no boolean type; 0/1 INTEGER is the convention. */
const toBool = (value: number): boolean => value !== 0;
const fromBool = (value: boolean): number => (value ? 1 : 0);

function provenance(
  modelId: string | null,
  modelVersion: string | null,
  generatedAt: number | null,
  promptVersion?: string | null,
): Provenance | null {
  if (modelId === null || generatedAt === null) return null;
  return {
    modelId,
    modelVersion: modelVersion ?? '',
    generatedAt,
    ...(promptVersion ? { promptVersion } : {}),
  };
}

export function rowToAudio(row: JournalEntryRow): AudioRef {
  return {
    uri: row.audio_uri,
    durationMs: row.audio_duration_ms,
    sampleRate: row.audio_sample_rate,
    channels: row.audio_channels,
    byteLength: row.audio_byte_length,
  };
}

export function rowToEntry(
  row: JournalEntryRow,
  topics: ScoredTopic[] = [],
  entities: MentionedEntity[] = [],
): JournalEntry {
  const transcriptProvenance = provenance(
    row.transcript_model_id,
    row.transcript_model_version,
    row.transcript_generated_at,
  );
  const reflectionProvenance = provenance(
    row.reflection_model_id,
    row.reflection_model_version,
    row.reflection_generated_at,
    row.reflection_prompt_version,
  );
  const moodProvenance = provenance(
    row.mood_model_id,
    row.mood_model_version,
    row.mood_generated_at,
  );

  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,

    audio: rowToAudio(row),

    transcript:
      row.transcript_text !== null && transcriptProvenance !== null
        ? {
            text: row.transcript_text,
            language: row.transcript_language,
            provenance: transcriptProvenance,
          }
        : null,

    reflection:
      row.summary !== null && reflectionProvenance !== null
        ? { title: row.title, summary: row.summary, provenance: reflectionProvenance }
        : null,

    mood:
      row.mood !== null && moodProvenance !== null
        ? {
            value: parseMood(row.mood),
            confidence: row.mood_confidence ?? 0,
            provenance: moodProvenance,
          }
        : null,

    topics,
    entities,

    processingState: parseProcessingState(row.processing_state),
    processingError: row.processing_error,

    isFavourite: toBool(row.is_favourite),

    version: row.version,
    deviceId: row.device_id,
  };
}

export function entryToRow(entry: JournalEntry): JournalEntryRow {
  return {
    id: entry.id,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
    deleted_at: entry.deletedAt,

    audio_uri: entry.audio.uri,
    audio_duration_ms: entry.audio.durationMs,
    audio_sample_rate: entry.audio.sampleRate,
    audio_channels: entry.audio.channels,
    audio_byte_length: entry.audio.byteLength,

    transcript_text: entry.transcript?.text ?? null,
    transcript_language: entry.transcript?.language ?? null,
    transcript_model_id: entry.transcript?.provenance.modelId ?? null,
    transcript_model_version: entry.transcript?.provenance.modelVersion ?? null,
    transcript_generated_at: entry.transcript?.provenance.generatedAt ?? null,

    title: entry.reflection?.title ?? null,
    summary: entry.reflection?.summary ?? null,
    reflection_model_id: entry.reflection?.provenance.modelId ?? null,
    reflection_model_version: entry.reflection?.provenance.modelVersion ?? null,
    reflection_prompt_version: entry.reflection?.provenance.promptVersion ?? null,
    reflection_generated_at: entry.reflection?.provenance.generatedAt ?? null,

    mood: entry.mood?.value ?? null,
    mood_confidence: entry.mood?.confidence ?? null,
    mood_model_id: entry.mood?.provenance.modelId ?? null,
    mood_model_version: entry.mood?.provenance.modelVersion ?? null,
    mood_generated_at: entry.mood?.provenance.generatedAt ?? null,

    processing_state: entry.processingState,
    processing_error: entry.processingError,

    is_favourite: fromBool(entry.isFavourite),
    version: entry.version,
    device_id: entry.deviceId,
  };
}

export const rowToTopic = (row: TopicRow): ScoredTopic => ({
  name: row.name,
  confidence: row.confidence,
});

export const rowToEntity = (row: EntityRow): MentionedEntity => ({
  kind: parseEntityKind(row.kind),
  name: row.name,
  confidence: row.confidence,
});
