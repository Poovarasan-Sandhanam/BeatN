import { confidenceBand, isActive, maySurface, type Memory, type MemoryEvidence } from '../Memory';

const evidence = (sources: number, confidence: number): MemoryEvidence => ({
  sourceEntryIds: Array.from({ length: sources }, (_, i) => `entry-${i}`),
  relevanceScore: 1,
  confidence,
});

describe('confidenceBand', () => {
  it('is insufficient with no evidence at all', () => {
    expect(confidenceBand(evidence(0, 0.99))).toBe('insufficient');
  });

  it('is high with several corroborating entries', () => {
    expect(confidenceBand(evidence(5, 0.8))).toBe('high');
  });

  it('is medium with one supporting entry', () => {
    expect(confidenceBand(evidence(1, 0.6))).toBe('medium');
  });

  it('does not reach high on confidence alone without corroboration', () => {
    expect(confidenceBand(evidence(1, 0.95))).toBe('medium');
  });

  it('is insufficient when confidence is weak even with many sources', () => {
    expect(confidenceBand(evidence(10, 0.2))).toBe('insufficient');
  });
});

describe('maySurface', () => {
  it('withholds an unsupported claim rather than hedging it', () => {
    expect(maySurface(evidence(0, 1))).toBe(false);
    expect(maySurface(evidence(10, 0.1))).toBe(false);
  });

  it('allows a supported claim', () => {
    expect(maySurface(evidence(3, 0.75))).toBe(true);
  });
});

describe('isActive', () => {
  const base: Memory = {
    id: 'm1',
    kind: 'goal',
    statement: 'Wants to move into product work',
    evidence: evidence(3, 0.8),
    firstSeenAt: 1,
    lastSeenAt: 2,
    mentionCount: 3,
    topics: ['career'],
    entityIds: [],
    supersededById: null,
    provenance: { modelId: 'm', modelVersion: '1', generatedAt: 0 },
    version: 1,
    deviceId: 'd1',
    deletedAt: null,
  };

  it('is active when neither superseded nor deleted', () => {
    expect(isActive(base)).toBe(true);
  });

  it('is inactive once superseded', () => {
    expect(isActive({ ...base, supersededById: 'm2' })).toBe(false);
  });

  it('is inactive once deleted', () => {
    expect(isActive({ ...base, deletedAt: 123 })).toBe(false);
  });
});
