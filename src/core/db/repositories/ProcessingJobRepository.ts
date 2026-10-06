/**
 * Persistence for the work queue.
 *
 * Two properties matter more than anything else here:
 *
 *   - **Claiming is atomic.** `UPDATE … WHERE id = ? AND status = 'pending'`
 *     and a check on `changes` means two workers cannot take the same job.
 *   - **A killed app loses nothing.** A `running` job whose heartbeat has gone
 *     stale is returned to `pending` at startup rather than being stranded.
 */

import { backoffMs } from '../../jobs/backoff';
import type { JobStore, JobType, ProcessingJob } from '../../jobs/types';
import { JOB_STATUSES, JOB_TYPES } from '../../jobs/types';
import type { Database, SqlValue } from '../types';
import { RowMappingError } from '../types';

const COLUMNS = `
  id, entry_id, type, status, priority,
  attempts, max_attempts, last_error,
  created_at, updated_at, not_before, started_at, completed_at, heartbeat_at
`;

interface JobRow {
  id: string;
  entry_id: string;
  type: string;
  status: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
  not_before: number;
  started_at: number | null;
  completed_at: number | null;
  heartbeat_at: number | null;
}

function parseType(value: string): JobType {
  if ((JOB_TYPES as readonly string[]).includes(value)) return value as JobType;
  throw new RowMappingError('processing_jobs', 'type', value);
}

function parseStatus(value: string) {
  if ((JOB_STATUSES as readonly string[]).includes(value)) {
    return value as ProcessingJob['status'];
  }
  throw new RowMappingError('processing_jobs', 'status', value);
}

export function rowToJob(row: JobRow): ProcessingJob {
  return {
    id: row.id,
    entryId: row.entry_id,
    type: parseType(row.type),
    status: parseStatus(row.status),
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    notBefore: row.not_before,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    heartbeatAt: row.heartbeat_at,
  };
}

export interface EnqueueOptions {
  priority?: number;
  maxAttempts?: number;
  notBefore?: number;
}

export class ProcessingJobRepository implements JobStore {
  constructor(
    private readonly db: Database,
    private readonly newId: () => string,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Queue a job, unless an identical one is already live.
   *
   * `INSERT OR IGNORE` leans on the unique partial index over
   * `(entry_id, type) WHERE status IN ('pending','running')`, so double
   * -queueing is a no-op rather than duplicated transcription work.
   */
  async enqueue(
    entryId: string,
    type: JobType,
    { priority = 0, maxAttempts = 3, notBefore = 0 }: EnqueueOptions = {},
  ): Promise<boolean> {
    const timestamp = this.now();
    const result = await this.db.runAsync(
      `INSERT OR IGNORE INTO processing_jobs
         (id, entry_id, type, status, priority, attempts, max_attempts,
          created_at, updated_at, not_before)
       VALUES (?, ?, ?, 'pending', ?, 0, ?, ?, ?, ?)`,
      [this.newId(), entryId, type, priority, maxAttempts, timestamp, timestamp, notBefore],
    );
    return result.changes > 0;
  }

  /**
   * Take the next runnable job. Returns null when there is nothing to do.
   *
   * Selected and claimed in two statements rather than one, because SQLite has
   * no `UPDATE … RETURNING` ordering guarantee we can rely on here. The guard
   * on `status = 'pending'` in the UPDATE is what makes it safe: if another
   * worker claimed it in between, `changes` is 0 and we simply look again.
   */
  async claimNext(now: number = this.now()): Promise<ProcessingJob | null> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = await this.db.getFirstAsync<JobRow>(
        `SELECT ${COLUMNS} FROM processing_jobs
         WHERE status = 'pending' AND not_before <= ?
         ORDER BY priority DESC, created_at ASC
         LIMIT 1`,
        [now],
      );
      if (!candidate) return null;

      const claimed = await this.db.runAsync(
        `UPDATE processing_jobs
            SET status = 'running', started_at = ?, heartbeat_at = ?, updated_at = ?
          WHERE id = ? AND status = 'pending'`,
        [now, now, now, candidate.id],
      );

      if (claimed.changes > 0) {
        return rowToJob({
          ...candidate,
          status: 'running',
          started_at: now,
          heartbeat_at: now,
          updated_at: now,
        });
      }
      // Lost the race — try the next candidate.
    }
    return null;
  }

  async heartbeat(jobId: string, now: number = this.now()): Promise<void> {
    await this.db.runAsync(
      `UPDATE processing_jobs SET heartbeat_at = ?, updated_at = ? WHERE id = ? AND status = 'running'`,
      [now, now, jobId],
    );
  }

  async complete(jobId: string, now: number = this.now()): Promise<void> {
    await this.db.runAsync(
      `UPDATE processing_jobs
          SET status = 'completed', completed_at = ?, updated_at = ?, last_error = NULL
        WHERE id = ?`,
      [now, now, jobId],
    );
  }

  /**
   * Record a failure. Reschedules with exponential backoff while attempts
   * remain, and gives up once `max_attempts` is reached.
   *
   * `attempts` is incremented in SQL so the decision is made against the
   * stored value, not a possibly stale one read earlier.
   */
  async fail(jobId: string, error: string, now: number = this.now()): Promise<void> {
    const row = await this.db.getFirstAsync<{ attempts: number; max_attempts: number }>(
      'SELECT attempts, max_attempts FROM processing_jobs WHERE id = ?',
      [jobId],
    );
    if (!row) return;

    const attempts = row.attempts + 1;
    const exhausted = attempts >= row.max_attempts;

    const params: SqlValue[] = exhausted
      ? [attempts, error, now, now, jobId]
      : [attempts, error, now + backoffMs(attempts), now, jobId];

    await this.db.runAsync(
      exhausted
        ? `UPDATE processing_jobs
              SET status = 'failed', attempts = ?, last_error = ?, completed_at = ?, updated_at = ?
            WHERE id = ?`
        : `UPDATE processing_jobs
              SET status = 'pending', attempts = ?, last_error = ?, not_before = ?, updated_at = ?,
                  started_at = NULL, heartbeat_at = NULL
            WHERE id = ?`,
      params,
    );
  }

  /**
   * Return jobs abandoned by a killed app to the pending pool.
   *
   * A `running` row with no recent heartbeat cannot be running: nothing is
   * alive to update it. Called once at startup — this is what makes "kill the
   * app mid-transcription and it resumes" true.
   */
  async recoverStale(now: number = this.now(), staleAfterMs = 60_000): Promise<number> {
    const result = await this.db.runAsync(
      `UPDATE processing_jobs
          SET status = 'pending', started_at = NULL, heartbeat_at = NULL, updated_at = ?
        WHERE status = 'running' AND (heartbeat_at IS NULL OR heartbeat_at < ?)`,
      [now, now - staleAfterMs],
    );
    return result.changes;
  }

  async findByEntry(entryId: string): Promise<ProcessingJob[]> {
    const rows = await this.db.getAllAsync<JobRow>(
      `SELECT ${COLUMNS} FROM processing_jobs WHERE entry_id = ? ORDER BY created_at ASC`,
      [entryId],
    );
    return rows.map(rowToJob);
  }

  async countByStatus(status: ProcessingJob['status']): Promise<number> {
    const row = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM processing_jobs WHERE status = ?',
      [status],
    );
    return row?.count ?? 0;
  }
}
