/**
 * The journal entry domain model and its processing state machine.
 *
 * Pure TypeScript: no React, no Expo, no SQL. Everything here is testable
 * without a device, which is the point of keeping the layer pure.
 */

/** Which model produced a derived field. Required for every AI-derived value. */
export interface Provenance {
  modelId: string;
  modelVersion: string;
  /** Prompt version, so a prompt change can invalidate stale derivations. */
  promptVersion?: string;
  generatedAt: number;
}

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

export type Mood = (typeof MOODS)[number];

export type EntityKind = 'person' | 'place' | 'organisation';

export interface ScoredTopic {
  name: string;
  confidence: number;
}

export interface MentionedEntity {
  kind: EntityKind;
  name: string;
  confidence: number;
}

export interface AudioRef {
  /** file:// URI. Null once the audio has been pruned but the entry kept. */
  uri: string | null;
  durationMs: number;
  sampleRate: number;
  channels: number;
  byteLength: number;
}

export interface Transcript {
  text: string;
  language: string | null;
  provenance: Provenance;
}

export interface Reflection {
  title: string | null;
  summary: string;
  provenance: Provenance;
}

export interface MoodAssessment {
  value: Mood;
  confidence: number;
  provenance: Provenance;
}

/**
 * The retrieval unit. An entry is what the user sees; a chunk is what the
 * search index stores. Embedding a whole rambling entry into one vector
 * averages away exactly the specifics that make retrieval useful.
 */
export interface EntryChunk {
  id: string;
  entryId: string;
  index: number;
  text: string;
  /** Character offsets into the transcript, so a hit can be highlighted. */
  startOffset: number;
  endOffset: number;
}

/**
 * Processing state. Persisted in the database rather than held in React state,
 * so an app kill mid-pipeline is recoverable.
 */
export const PROCESSING_STATES = [
  'recorded',
  'transcribing',
  'transcribed',
  'analysing',
  'analysed',
  'embedding',
  'indexed',
  'extracting_memories',
  'ready',
  'failed',
] as const;

export type ProcessingState = (typeof PROCESSING_STATES)[number];

/**
 * Legal transitions. Encoded as data so the machine is testable and so an
 * invalid transition is a caught error rather than a silently corrupt row.
 */
const TRANSITIONS: Record<ProcessingState, readonly ProcessingState[]> = {
  recorded: ['transcribing', 'failed'],
  transcribing: ['transcribed', 'failed'],
  transcribed: ['analysing', 'failed'],
  analysing: ['analysed', 'failed'],
  // 'ready' is reachable directly because embedding and memory extraction are
  // parked (see docs/IDEAS.md). Analysis is currently the last step. When
  // embedding is built it slots in without changing anything downstream.
  analysed: ['embedding', 'ready', 'failed'],
  embedding: ['indexed', 'failed'],
  indexed: ['extracting_memories', 'failed'],
  extracting_memories: ['ready', 'failed'],
  ready: [],
  // Retry re-enters the pipeline at the step that failed, so `failed` can go
  // back to any in-progress state.
  failed: ['transcribing', 'analysing', 'embedding', 'extracting_memories'],
};

export function canTransition(from: ProcessingState, to: ProcessingState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ProcessingState, to: ProcessingState): void {
  if (!canTransition(from, to)) {
    throw new Error(`INVALID_STATE_TRANSITION:${from}->${to}`);
  }
}

/** True once the user can read their own words, even if analysis is pending. */
export function isReadable(state: ProcessingState): boolean {
  return state !== 'recorded' && state !== 'transcribing';
}

/** True when no further work is queued for this entry. */
export function isTerminal(state: ProcessingState): boolean {
  return TRANSITIONS[state].length === 0;
}

export interface JournalEntry {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;

  audio: AudioRef;
  transcript: Transcript | null;
  reflection: Reflection | null;
  mood: MoodAssessment | null;
  topics: ScoredTopic[];
  entities: MentionedEntity[];

  processingState: ProcessingState;
  processingError: string | null;

  isFavourite: boolean;

  /** Sync metadata — see SYSTEM_DESIGN.md §11. */
  version: number;
  deviceId: string;
}
