/**
 * The only code that writes journal entries.
 *
 * Note the ordering guarantee in `create`: the entry row exists before any AI
 * work is queued. A recording must never be lost because transcription failed.
 */

import type {
  JournalEntry,
  MentionedEntity,
  MoodAssessment,
  ProcessingState,
  Reflection,
  ScoredTopic,
  Transcript,
} from '../../../domain/entry/JournalEntry';
import { assertTransition } from '../../../domain/entry/JournalEntry';
import {
  entryToRow,
  rowToEntity,
  rowToEntry,
  rowToTopic,
  type EntityRow,
  type JournalEntryRow,
  type TopicRow,
} from '../mappers';
import type { Database, SqlValue } from '../types';

const ENTRY_COLUMNS = `
  id, created_at, updated_at, deleted_at,
  audio_uri, audio_duration_ms, audio_sample_rate, audio_channels, audio_byte_length,
  transcript_text, transcript_language, transcript_model_id, transcript_model_version,
  transcript_generated_at,
  title, summary, reflection_model_id, reflection_model_version, reflection_prompt_version,
  reflection_generated_at,
  mood, mood_confidence, mood_model_id, mood_model_version, mood_generated_at,
  processing_state, processing_error, is_favourite, version, device_id
`;

export interface ListOptions {
  limit?: number;
  offset?: number;
}

export class JournalEntryRepository {
  constructor(
    private readonly db: Database,
    private readonly now: () => number = Date.now,
  ) {}

  async create(entry: JournalEntry): Promise<void> {
    const row = entryToRow(entry);
    const columns = Object.keys(row);
    const placeholders = columns.map(() => '?').join(', ');

    await this.db.runAsync(
      `INSERT INTO journal_entries (${columns.join(', ')}) VALUES (${placeholders})`,
      Object.values(row) as SqlValue[],
    );
  }

  async findById(id: string): Promise<JournalEntry | null> {
    const row = await this.db.getFirstAsync<JournalEntryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM journal_entries WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    if (!row) return null;

    const [topics, entities] = await Promise.all([this.topicsFor(id), this.entitiesFor(id)]);
    return rowToEntry(row, topics, entities);
  }

  /** Newest first. Topics and entities are not loaded — the list does not need them. */
  async list({ limit = 50, offset = 0 }: ListOptions = {}): Promise<JournalEntry[]> {
    const rows = await this.db.getAllAsync<JournalEntryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM journal_entries
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );
    return rows.map((row) => rowToEntry(row));
  }

  /** Entries whose processing never finished — the restart-recovery query. */
  async findUnfinished(): Promise<JournalEntry[]> {
    const rows = await this.db.getAllAsync<JournalEntryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM journal_entries
       WHERE deleted_at IS NULL AND processing_state NOT IN ('ready', 'failed')
       ORDER BY created_at ASC`,
    );
    return rows.map((row) => rowToEntry(row));
  }

  /**
   * Moves an entry through the pipeline. The transition is validated against
   * the domain state machine first, so an illegal move throws rather than
   * silently writing a nonsensical state.
   */
  async setProcessingState(
    id: string,
    from: ProcessingState,
    to: ProcessingState,
    error: string | null = null,
  ): Promise<void> {
    assertTransition(from, to);

    const result = await this.db.runAsync(
      `UPDATE journal_entries
         SET processing_state = ?, processing_error = ?, updated_at = ?, version = version + 1
       WHERE id = ? AND processing_state = ? AND deleted_at IS NULL`,
      [to, error, this.now(), id, from],
    );

    // Zero rows means another writer moved it first. Fail loudly: silently
    // losing a transition is how entries get stuck forever.
    if (result.changes === 0) {
      throw new Error(`ENTRY_STATE_CONFLICT:${id}:${from}->${to}`);
    }
  }

  async saveTranscript(id: string, transcript: Transcript): Promise<void> {
    await this.db.runAsync(
      `UPDATE journal_entries
         SET transcript_text = ?, transcript_language = ?,
             transcript_model_id = ?, transcript_model_version = ?, transcript_generated_at = ?,
             updated_at = ?, version = version + 1
       WHERE id = ?`,
      [
        transcript.text,
        transcript.language,
        transcript.provenance.modelId,
        transcript.provenance.modelVersion,
        transcript.provenance.generatedAt,
        this.now(),
        id,
      ],
    );
  }

  /**
   * Writes the whole analysis atomically. Topics and entities are replaced,
   * not appended, so re-running analysis on an entry is idempotent.
   */
  async saveAnalysis(
    id: string,
    reflection: Reflection,
    mood: MoodAssessment,
    topics: ScoredTopic[],
    entities: MentionedEntity[],
  ): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `UPDATE journal_entries
           SET title = ?, summary = ?,
               reflection_model_id = ?, reflection_model_version = ?,
               reflection_prompt_version = ?, reflection_generated_at = ?,
               mood = ?, mood_confidence = ?,
               mood_model_id = ?, mood_model_version = ?, mood_generated_at = ?,
               updated_at = ?, version = version + 1
         WHERE id = ?`,
        [
          reflection.title,
          reflection.summary,
          reflection.provenance.modelId,
          reflection.provenance.modelVersion,
          reflection.provenance.promptVersion ?? null,
          reflection.provenance.generatedAt,
          mood.value,
          mood.confidence,
          mood.provenance.modelId,
          mood.provenance.modelVersion,
          mood.provenance.generatedAt,
          this.now(),
          id,
        ],
      );

      await this.db.runAsync('DELETE FROM entry_topics WHERE entry_id = ?', [id]);
      for (const topic of topics) {
        await this.db.runAsync(
          'INSERT INTO entry_topics (entry_id, name, confidence) VALUES (?, ?, ?)',
          [id, topic.name, topic.confidence],
        );
      }

      await this.db.runAsync('DELETE FROM entry_entities WHERE entry_id = ?', [id]);
      for (const entity of entities) {
        await this.db.runAsync(
          'INSERT INTO entry_entities (entry_id, kind, name, confidence) VALUES (?, ?, ?, ?)',
          [id, entity.kind, entity.name, entity.confidence],
        );
      }
    });
  }

  async setFavourite(id: string, isFavourite: boolean): Promise<void> {
    await this.db.runAsync(
      `UPDATE journal_entries SET is_favourite = ?, updated_at = ?, version = version + 1
       WHERE id = ?`,
      [isFavourite ? 1 : 0, this.now(), id],
    );
  }

  /** Tombstone, never a hard delete — a hard delete cannot be synced. */
  async softDelete(id: string): Promise<void> {
    const timestamp = this.now();
    await this.db.runAsync(
      `UPDATE journal_entries SET deleted_at = ?, updated_at = ?, version = version + 1
       WHERE id = ? AND deleted_at IS NULL`,
      [timestamp, timestamp, id],
    );
  }

  async countLive(): Promise<number> {
    const row = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM journal_entries WHERE deleted_at IS NULL',
    );
    return row?.count ?? 0;
  }

  private async topicsFor(entryId: string): Promise<ScoredTopic[]> {
    const rows = await this.db.getAllAsync<TopicRow>(
      'SELECT entry_id, name, confidence FROM entry_topics WHERE entry_id = ? ORDER BY confidence DESC',
      [entryId],
    );
    return rows.map(rowToTopic);
  }

  private async entitiesFor(entryId: string): Promise<MentionedEntity[]> {
    const rows = await this.db.getAllAsync<EntityRow>(
      'SELECT entry_id, kind, name, confidence FROM entry_entities WHERE entry_id = ? ORDER BY confidence DESC',
      [entryId],
    );
    return rows.map(rowToEntity);
  }
}
