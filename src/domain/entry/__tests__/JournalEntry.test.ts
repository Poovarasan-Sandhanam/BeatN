import {
  PROCESSING_STATES,
  assertTransition,
  canTransition,
  isReadable,
  isTerminal,
  type ProcessingState,
} from '../JournalEntry';

describe('processing state machine', () => {
  it('walks the happy path end to end', () => {
    const path: ProcessingState[] = [
      'recorded',
      'transcribing',
      'transcribed',
      'analysing',
      'analysed',
      'embedding',
      'indexed',
      'extracting_memories',
      'ready',
    ];
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it('lets every non-terminal state fail', () => {
    for (const state of PROCESSING_STATES) {
      if (state === 'ready' || state === 'failed') continue;
      expect(canTransition(state, 'failed')).toBe(true);
    }
  });

  it('rejects skipping a step', () => {
    expect(canTransition('recorded', 'ready')).toBe(false);
    expect(canTransition('transcribed', 'embedding')).toBe(false);
  });

  it('throws with both states named', () => {
    expect(() => assertTransition('recorded', 'ready')).toThrow(
      'INVALID_STATE_TRANSITION:recorded->ready',
    );
  });

  it('lets a failure retry the step that failed', () => {
    expect(canTransition('failed', 'transcribing')).toBe(true);
    expect(canTransition('failed', 'embedding')).toBe(true);
  });

  it('treats ready as terminal and recorded as not', () => {
    expect(isTerminal('ready')).toBe(true);
    expect(isTerminal('recorded')).toBe(false);
  });

  it('makes the entry readable as soon as a transcript exists', () => {
    expect(isReadable('recorded')).toBe(false);
    expect(isReadable('transcribing')).toBe(false);
    // The user reads their words while analysis is still queued.
    expect(isReadable('transcribed')).toBe(true);
    expect(isReadable('analysing')).toBe(true);
  });

  it('has a transition table covering every declared state', () => {
    for (const state of PROCESSING_STATES) {
      expect(() => canTransition(state, 'ready')).not.toThrow();
    }
  });
});
