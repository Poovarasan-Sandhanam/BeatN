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
import type { VoiceFeatures } from '../../../domain/voice/voiceFeatures';
import {
  entryToRow,
  parseVoice,
  rowToEntity,
  rowToEntry,
  rowToTopic,
  type EntityRow,
  type JournalEntryRow,
  type TopicRow,
} from '../mappers';
import type { Database, SqlValue } from '../types';

/** Every column that holds something the person said or the app derived from it. */
const ERASED_CONTENT = `
  transcript_text = NULL, transcript_language = NULL, transcript_model_id = NULL,
  transcript_model_version = NULL, transcript_generated_at = NULL,
  title = NULL, summary = NULL, suggestion = NULL,
  reflection_model_id = NULL, reflection_model_version = NULL,
  reflection_prompt_version = NULL, reflection_generated_at = NULL,
  mood = NULL, mood_confidence = NULL, mood_model_id = NULL, mood_model_version = NULL,
  mood_generated_at = NULL, voice_json = NULL, processing_error = NULL,
  audio_duration_ms = 0, audio_byte_length = 0`;

const ENTRY_COLUMNS = `
  id, created_at, updated_at, deleted_at,
  audio_uri, audio_duration_ms, audio_sample_rate, audio_channels, audio_byte_length,
  transcript_text, transcript_language, transcript_model_id, transcript_model_version,
  transcript_generated_at,
  title, summary, suggestion, reflection_model_id, reflection_model_version, reflection_prompt_version,
  reflection_generated_at,
  mood, mood_confidence, mood_model_id, mood_model_version, mood_generated_at,
  voice_json,
  processing_state, processing_error, is_favourite, version, device_id
`;

export interface ListOptions {
  limit?: number;
  offset?: number;
}

export class JournalEntryRepository {
  /**
   * @param resolveAudioUri Maps a stored recording URI to where the file is
   *   now. iOS can move the app's container when the app is updated, so an
   *   absolute path saved by an earlier install may point at a folder that no
   *   longer exists; the file itself is still in the recordings folder under
   *   the same name. Applied to every URI this repository hands out.
   */
  constructor(
    private readonly db: Database,
    private readonly now: () => number = Date.now,
    private readonly resolveAudioUri: (storedUri: string) => string = (uri) => uri,
  ) {}

  private toEntry(...args: Parameters<typeof rowToEntry>): JournalEntry {
    const entry = rowToEntry(...args);
    if (!entry.audio.uri) return entry;
    return { ...entry, audio: { ...entry.audio, uri: this.resolveAudioUri(entry.audio.uri) } };
  }

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
    return this.toEntry(row, topics, entities);
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
    return rows.map((row) => this.toEntry(row));
  }

  /** Entries whose processing never finished — the restart-recovery query. */
  async findUnfinished(): Promise<JournalEntry[]> {
    const rows = await this.db.getAllAsync<JournalEntryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM journal_entries
       WHERE deleted_at IS NULL AND processing_state NOT IN ('ready', 'failed')
       ORDER BY created_at ASC`,
    );
    return rows.map((row) => this.toEntry(row));
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
       WHERE id = ? AND deleted_at IS NULL`,
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
      // Guarded: an analysis still running when the entry was deleted must
      // not write its words back into the erased row.
      const updated = await this.db.runAsync(
        `UPDATE journal_entries
           SET title = ?, summary = ?, suggestion = ?,
               reflection_model_id = ?, reflection_model_version = ?,
               reflection_prompt_version = ?, reflection_generated_at = ?,
               mood = ?, mood_confidence = ?,
               mood_model_id = ?, mood_model_version = ?, mood_generated_at = ?,
               updated_at = ?, version = version + 1
         WHERE id = ? AND deleted_at IS NULL`,
        [
          reflection.title,
          reflection.summary,
          reflection.suggestion,
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
      if (updated.changes === 0) return;

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

  /**
   * Erases an entry: every word, mood and measurement is wiped, its topics,
   * entities and pending work removed, and a bare tombstone kept.
   *
   * A tombstone, not a hard delete, because sync will need to know the entry
   * existed and is gone. It keeps the id, dates and the recording's file name
   * — none of it is anything the person said. The file name stays so that
   * launch-time recovery never mistakes a leftover file for an unsaved entry;
   * the caller deletes the file itself. Returns the recording's URI, if any.
   */
  async eraseEntry(id: string): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ audio_uri: string | null }>(
      'SELECT audio_uri FROM journal_entries WHERE id = ?',
      [id],
    );
    if (!row) return null;

    const timestamp = this.now();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `UPDATE journal_entries
            SET deleted_at = COALESCE(deleted_at, ?), ${ERASED_CONTENT},
                updated_at = ?, version = version + 1
          WHERE id = ?`,
        [timestamp, timestamp, id],
      );
      await this.db.runAsync('DELETE FROM entry_topics WHERE entry_id = ?', [id]);
      await this.db.runAsync('DELETE FROM entry_entities WHERE entry_id = ?', [id]);
      await this.db.runAsync('DELETE FROM processing_jobs WHERE entry_id = ?', [id]);
    });
    return row.audio_uri ? this.resolveAudioUri(row.audio_uri) : null;
  }

  /**
   * Erases what earlier versions left behind: before erasing existed, delete
   * only hid an entry and kept its content. Returns every deleted entry's
   * recording URI so the caller can make sure the files are gone too.
   */
  async eraseDeletedContent(): Promise<string[]> {
    const rows = await this.db.getAllAsync<{ audio_uri: string }>(
      'SELECT audio_uri FROM journal_entries WHERE deleted_at IS NOT NULL AND audio_uri IS NOT NULL',
    );
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `UPDATE journal_entries SET ${ERASED_CONTENT}
          WHERE deleted_at IS NOT NULL
            AND (transcript_text IS NOT NULL OR summary IS NOT NULL OR mood IS NOT NULL
                 OR voice_json IS NOT NULL OR suggestion IS NOT NULL)`,
      );
      for (const table of ['entry_topics', 'entry_entities', 'processing_jobs']) {
        await this.db.runAsync(
          `DELETE FROM ${table}
            WHERE entry_id IN (SELECT id FROM journal_entries WHERE deleted_at IS NOT NULL)`,
        );
      }
    });
    return rows.map((row) => this.resolveAudioUri(row.audio_uri));
  }

  /**
   * File names of every recording any entry has ever pointed at — deleted
   * entries included, so deleting an entry never brings its audio back as a
   * "recovered" recording. Names, not URIs: the path prefix can differ
   * between app versions while the name cannot.
   */
  async knownRecordingNames(): Promise<Set<string>> {
    const rows = await this.db.getAllAsync<{ audio_uri: string }>(
      'SELECT audio_uri FROM journal_entries WHERE audio_uri IS NOT NULL',
    );
    return new Set(rows.map((row) => fileName(row.audio_uri)));
  }

  /**
   * Entries recorded in [from, to), oldest first, with their topics — for the
   * Insights screen. Topics come in one query for the whole range rather than
   * one per entry.
   */
  async listBetween(from: number, to: number, limit = 2000): Promise<JournalEntry[]> {
    const rows = await this.db.getAllAsync<JournalEntryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM journal_entries
        WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?
        ORDER BY created_at ASC
        LIMIT ?`,
      [from, to, limit],
    );
    if (rows.length === 0) return [];

    const topicRows = await this.db.getAllAsync<TopicRow>(
      `SELECT t.entry_id, t.name, t.confidence FROM entry_topics t
         JOIN journal_entries e ON e.id = t.entry_id
        WHERE e.deleted_at IS NULL AND e.created_at >= ? AND e.created_at < ?
        ORDER BY t.confidence DESC`,
      [from, to],
    );
    const topicsByEntry = new Map<string, ScoredTopic[]>();
    for (const row of topicRows) {
      topicsByEntry.set(row.entry_id, [...(topicsByEntry.get(row.entry_id) ?? []), rowToTopic(row)]);
    }
    return rows.map((row) => this.toEntry(row, topicsByEntry.get(row.id) ?? []));
  }

  /** Voice measurements from before a time, newest first — the baseline for judging a period. */
  async voicesBefore(before: number, limit = 20): Promise<VoiceFeatures[]> {
    const rows = await this.db.getAllAsync<{ voice_json: string | null }>(
      `SELECT voice_json FROM journal_entries
        WHERE deleted_at IS NULL AND voice_json IS NOT NULL AND created_at < ?
        ORDER BY created_at DESC LIMIT ?`,
      [before, limit],
    );
    return rows.map((row) => parseVoice(row.voice_json)).filter((v): v is VoiceFeatures => v !== null);
  }

  async saveVoice(id: string, voice: VoiceFeatures): Promise<void> {
    await this.db.runAsync(
      `UPDATE journal_entries SET voice_json = ?, updated_at = ?, version = version + 1
        WHERE id = ? AND deleted_at IS NULL`,
      [JSON.stringify(voice), this.now(), id],
    );
  }

  /**
   * Voice measurements from the person's most recent other entries — the
   * baseline a new entry is compared against. Newest first.
   */
  async recentVoices(excludeId: string, limit = 20): Promise<VoiceFeatures[]> {
    const rows = await this.db.getAllAsync<{ voice_json: string | null }>(
      `SELECT voice_json FROM journal_entries
        WHERE deleted_at IS NULL AND voice_json IS NOT NULL AND id != ?
        ORDER BY created_at DESC LIMIT ?`,
      [excludeId, limit],
    );
    return rows.map((row) => parseVoice(row.voice_json)).filter((v): v is VoiceFeatures => v !== null);
  }

  /**
   * Give up on an entry whose processing will not be retried automatically.
   *
   * Unlike `setProcessingState` this does not need to know the current state:
   * every in-progress state may move to `failed`, and the caller (a job that
   * ran out of attempts) cannot know which step the entry reached.
   */
  async markFailed(id: string, error: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE journal_entries
          SET processing_state = 'failed', processing_error = ?, updated_at = ?, version = version + 1
        WHERE id = ? AND deleted_at IS NULL AND processing_state NOT IN ('ready', 'failed')`,
      [error, this.now(), id],
    );
  }

  /**
   * Fail every entry that is mid-processing with no job left to finish it.
   *
   * Run once at startup, after stale jobs are recovered. Catches entries a
   * crash or an older build stranded — without it they show a spinner forever
   * and never offer "Try again". Returns how many entries were failed.
   */
  async failOrphaned(error = 'PROCESSING_INTERRUPTED'): Promise<number> {
    const result = await this.db.runAsync(
      `UPDATE journal_entries
          SET processing_state = 'failed', processing_error = ?, updated_at = ?, version = version + 1
        WHERE deleted_at IS NULL
          AND processing_state NOT IN ('ready', 'failed')
          AND NOT EXISTS (
            SELECT 1 FROM processing_jobs j
             WHERE j.entry_id = journal_entries.id AND j.status IN ('pending', 'running')
          )`,
      [error, this.now()],
    );
    return result.changes;
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

export function fileName(uri: string): string {
  return uri.slice(uri.lastIndexOf('/') + 1);
}
