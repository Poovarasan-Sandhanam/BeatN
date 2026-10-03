import type { JournalEntry } from '../../../domain/entry/JournalEntry';
import { JournalEntryRepository } from '../repositories/JournalEntryRepository';
import type { Database, SqlRunResult, SqlValue } from '../types';

interface Executed {
  sql: string;
  params: SqlValue[];
}

/**
 * Records SQL without executing it. This verifies the repository's behaviour —
 * transaction boundaries, soft-delete semantics, conflict handling, replace
 * rather than append — which is what regresses. The SQL itself is only truly
 * exercised on a device; see the note in docs/ROADMAP.md.
 */
class RecordingDatabase implements Database {
  run: Executed[] = [];
  queries: Executed[] = [];
  transactions = 0;
  changes = 1;
  firstRow: unknown = null;
  allRows: unknown[] = [];

  async execAsync(): Promise<void> {}

  async runAsync(sql: string, params: SqlValue[] = []): Promise<SqlRunResult> {
    this.run.push({ sql, params });
    return { lastInsertRowId: 1, changes: this.changes };
  }

  async getFirstAsync<T>(sql: string, params: SqlValue[] = []): Promise<T | null> {
    this.queries.push({ sql, params });
    return this.firstRow as T | null;
  }

  async getAllAsync<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    this.queries.push({ sql, params });
    return this.allRows as T[];
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.transactions += 1;
    await task();
  }

  sqlMatching(fragment: string): Executed[] {
    return [...this.run, ...this.queries].filter((e) => e.sql.includes(fragment));
  }
}

const entry: JournalEntry = {
  id: 'entry-1',
  createdAt: 1_000,
  updatedAt: 1_000,
  deletedAt: null,
  audio: { uri: 'file:///a.wav', durationMs: 30_000, sampleRate: 16_000, channels: 1, byteLength: 10 },
  transcript: null,
  reflection: null,
  mood: null,
  topics: [],
  entities: [],
  processingState: 'recorded',
  processingError: null,
  isFavourite: false,
  version: 1,
  deviceId: 'device-a',
};

const provenance = { modelId: 'm', modelVersion: '1', generatedAt: 2_000 };

describe('create', () => {
  it('inserts the entry row with every column bound', async () => {
    const db = new RecordingDatabase();
    await new JournalEntryRepository(db, () => 5_000).create(entry);

    expect(db.run).toHaveLength(1);
    expect(db.run[0].sql).toContain('INSERT INTO journal_entries');
    // One placeholder per bound value — a mismatch here is a silent corruption.
    const placeholders = (db.run[0].sql.match(/\?/g) ?? []).length;
    expect(placeholders).toBe(db.run[0].params.length);
  });
});

describe('setProcessingState', () => {
  it('rejects an illegal transition before touching the database', async () => {
    const db = new RecordingDatabase();
    const repo = new JournalEntryRepository(db, () => 5_000);

    await expect(repo.setProcessingState('entry-1', 'recorded', 'ready')).rejects.toThrow(
      'INVALID_STATE_TRANSITION:recorded->ready',
    );
    expect(db.run).toHaveLength(0);
  });

  it('writes a legal transition and bumps the version', async () => {
    const db = new RecordingDatabase();
    await new JournalEntryRepository(db, () => 5_000).setProcessingState(
      'entry-1',
      'recorded',
      'transcribing',
    );

    expect(db.run[0].sql).toContain('version = version + 1');
    expect(db.run[0].params).toEqual(['transcribing', null, 5_000, 'entry-1', 'recorded']);
  });

  it('guards on the expected current state, so a concurrent writer cannot be clobbered', async () => {
    const db = new RecordingDatabase();
    await new JournalEntryRepository(db).setProcessingState('entry-1', 'recorded', 'transcribing');

    expect(db.run[0].sql).toContain('AND processing_state = ?');
  });

  it('throws when no row matched rather than silently losing the transition', async () => {
    const db = new RecordingDatabase();
    db.changes = 0;

    await expect(
      new JournalEntryRepository(db).setProcessingState('entry-1', 'recorded', 'transcribing'),
    ).rejects.toThrow('ENTRY_STATE_CONFLICT:entry-1:recorded->transcribing');
  });

  it('records the error message when moving to failed', async () => {
    const db = new RecordingDatabase();
    await new JournalEntryRepository(db, () => 7_000).setProcessingState(
      'entry-1',
      'transcribing',
      'failed',
      'MODEL_NOT_LOADED',
    );

    expect(db.run[0].params).toContain('MODEL_NOT_LOADED');
  });
});

describe('saveAnalysis', () => {
  const run = async (db: RecordingDatabase) =>
    new JournalEntryRepository(db, () => 9_000).saveAnalysis(
      'entry-1',
      { title: 'T', summary: 'S', provenance: { ...provenance, promptVersion: 'v1' } },
      { value: 'reflective', confidence: 0.7, provenance },
      [
        { name: 'career', confidence: 0.9 },
        { name: 'learning', confidence: 0.4 },
      ],
      [{ kind: 'person', name: 'Sam', confidence: 0.8 }],
    );

  it('writes everything in a single transaction', async () => {
    const db = new RecordingDatabase();
    await run(db);
    expect(db.transactions).toBe(1);
  });

  it('replaces topics rather than appending, so re-analysis is idempotent', async () => {
    const db = new RecordingDatabase();
    await run(db);

    const deletes = db.sqlMatching('DELETE FROM entry_topics');
    const inserts = db.sqlMatching('INSERT INTO entry_topics');
    expect(deletes).toHaveLength(1);
    expect(inserts).toHaveLength(2);
    // The delete must come first, or the insert would collide on the primary key.
    expect(db.run.indexOf(deletes[0])).toBeLessThan(db.run.indexOf(inserts[0]));
  });

  it('replaces entities the same way', async () => {
    const db = new RecordingDatabase();
    await run(db);

    expect(db.sqlMatching('DELETE FROM entry_entities')).toHaveLength(1);
    expect(db.sqlMatching('INSERT INTO entry_entities')).toHaveLength(1);
  });

  it('persists the prompt version so a prompt change can invalidate stale output', async () => {
    const db = new RecordingDatabase();
    await run(db);
    expect(db.run[0].params).toContain('v1');
  });
});

describe('softDelete', () => {
  it('tombstones rather than deleting, because a hard delete cannot be synced', async () => {
    const db = new RecordingDatabase();
    await new JournalEntryRepository(db, () => 4_000).softDelete('entry-1');

    expect(db.run[0].sql).toContain('SET deleted_at = ?');
    expect(db.run[0].sql).not.toContain('DELETE FROM journal_entries');
    expect(db.run[0].params[0]).toBe(4_000);
  });

  it('does not re-stamp an already deleted entry', async () => {
    const db = new RecordingDatabase();
    await new JournalEntryRepository(db).softDelete('entry-1');
    expect(db.run[0].sql).toContain('AND deleted_at IS NULL');
  });
});

describe('reads exclude deleted entries', () => {
  it('findById filters tombstones', async () => {
    const db = new RecordingDatabase();
    await new JournalEntryRepository(db).findById('entry-1');
    expect(db.queries[0].sql).toContain('deleted_at IS NULL');
  });

  it('findById returns null without loading topics when the row is missing', async () => {
    const db = new RecordingDatabase();
    db.firstRow = null;

    expect(await new JournalEntryRepository(db).findById('nope')).toBeNull();
    expect(db.sqlMatching('entry_topics')).toHaveLength(0);
  });

  it('list filters tombstones and orders newest first', async () => {
    const db = new RecordingDatabase();
    await new JournalEntryRepository(db).list();

    expect(db.queries[0].sql).toContain('deleted_at IS NULL');
    expect(db.queries[0].sql).toContain('ORDER BY created_at DESC');
    expect(db.queries[0].params).toEqual([50, 0]);
  });

  it('list honours limit and offset', async () => {
    const db = new RecordingDatabase();
    await new JournalEntryRepository(db).list({ limit: 10, offset: 20 });
    expect(db.queries[0].params).toEqual([10, 20]);
  });

  it('findUnfinished skips terminal states', async () => {
    const db = new RecordingDatabase();
    await new JournalEntryRepository(db).findUnfinished();

    expect(db.queries[0].sql).toContain("NOT IN ('ready', 'failed')");
    expect(db.queries[0].sql).toContain('ORDER BY created_at ASC');
  });

  it('countLive returns zero rather than undefined on an empty database', async () => {
    const db = new RecordingDatabase();
    db.firstRow = null;
    expect(await new JournalEntryRepository(db).countLive()).toBe(0);
  });
});
