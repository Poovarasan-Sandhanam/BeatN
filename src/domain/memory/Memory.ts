/**
 * Memories are what separates BeatN from a notes app.
 *
 * A Memory is NOT an entry. It is a durable, evidence-backed claim distilled
 * from one or more entries, and it is the unit RAG retrieves. "What was I
 * thinking about when I started looking for a new job?" is answerable by
 * retrieving memories; it is not answerable by summarising a list of notes.
 */

import type { Provenance } from '../entry/JournalEntry';

export const MEMORY_KINDS = [
  'fact',
  'preference',
  'goal',
  'event',
  'relationship',
  'thread',
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

/**
 * The anti-hallucination primitive. Every claim BeatN makes is bound to the
 * entries that support it; `sourceEntryIds` is never empty, and the database
 * enforces that with a foreign key.
 */
export interface MemoryEvidence {
  sourceEntryIds: string[];
  /** 0..1 — how well the evidence matches the query that retrieved it. */
  relevanceScore: number;
  /** 0..1 — how strongly the evidence supports the statement. */
  confidence: number;
}

export type ConfidenceBand = 'high' | 'medium' | 'insufficient';

/**
 * How certainty is communicated to the user. Deliberately conservative: an
 * unsupported claim is withheld, never hedged into existence.
 *
 *   high         → state it plainly, cite sources
 *   medium       → hedge ("you mentioned…"), cite sources
 *   insufficient → say there is not enough in the journal. Do not generate.
 */
export function confidenceBand(evidence: MemoryEvidence): ConfidenceBand {
  const sources = evidence.sourceEntryIds.length;
  if (sources === 0) return 'insufficient';
  if (sources >= 3 && evidence.confidence >= 0.7) return 'high';
  if (evidence.confidence >= 0.45) return 'medium';
  return 'insufficient';
}

/** A claim may only be surfaced to the user when it is actually supported. */
export function maySurface(evidence: MemoryEvidence): boolean {
  return confidenceBand(evidence) !== 'insufficient';
}

export interface Memory {
  id: string;
  kind: MemoryKind;

  /** One sentence, in the user's own framing. */
  statement: string;

  evidence: MemoryEvidence;

  firstSeenAt: number;
  lastSeenAt: number;
  mentionCount: number;

  topics: string[];
  entityIds: string[];

  /**
   * Memories evolve rather than being overwritten: when a later entry revises
   * a memory, the old one is superseded and kept. History is the product.
   */
  supersededById: string | null;

  provenance: Provenance;

  version: number;
  deviceId: string;
  deletedAt: number | null;
}

/** A memory stops being retrievable once something newer replaces it. */
export function isActive(memory: Memory): boolean {
  return memory.supersededById === null && memory.deletedAt === null;
}
