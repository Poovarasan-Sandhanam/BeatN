/**
 * The durable work queue.
 *
 * Processing state lives in SQLite, not in React state, so that killing the
 * app mid-transcription loses nothing: on next launch the job is still there,
 * still pending, and picked up again.
 */

/** Only the two steps the pipeline has today. Embedding and memory extraction are parked. */
export const JOB_TYPES = ['transcribe', 'analyse'] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface ProcessingJob {
  id: string;
  entryId: string;
  type: JobType;
  status: JobStatus;
  /** Higher runs first. User-initiated work outranks backfill. */
  priority: number;

  attempts: number;
  maxAttempts: number;
  lastError: string | null;

  createdAt: number;
  updatedAt: number;
  /** Not claimable until this time — how backoff is expressed. */
  notBefore: number;
  startedAt: number | null;
  completedAt: number | null;
  /** Last sign of life. A stale value means the app died mid-job. */
  heartbeatAt: number | null;
}

/**
 * Handlers must be idempotent: a job can run twice if the app is killed
 * between the work completing and the row being marked done.
 */
export type JobHandler = (job: ProcessingJob) => Promise<void>;

/** The slice of persistence the queue needs. Narrow, so tests can fake it. */
export interface JobStore {
  claimNext(now: number): Promise<ProcessingJob | null>;
  heartbeat(jobId: string, now: number): Promise<void>;
  complete(jobId: string, now: number): Promise<void>;
  /** Reschedules with backoff, or gives up once maxAttempts is reached. */
  fail(jobId: string, error: string, now: number): Promise<void>;
  /** Returns stale `running` jobs to `pending`. Called once at startup. */
  recoverStale(now: number, staleAfterMs: number): Promise<number>;
}
