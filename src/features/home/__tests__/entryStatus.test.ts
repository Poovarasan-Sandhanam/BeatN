import type { JournalEntry } from '../../../domain/entry/JournalEntry';
import { PROCESSING_STATES } from '../../../domain/entry/JournalEntry';
import { describeStatus, formatClockTime, formatEntryDate, previewOf } from '../entryStatus';

const entry = (overrides: Partial<JournalEntry> = {}): JournalEntry =>
  ({
    id: 'e1',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    audio: { uri: null, durationMs: 0, sampleRate: 0, channels: 0, byteLength: 0 },
    transcript: null,
    reflection: null,
    mood: null,
    topics: [],
    entities: [],
    processingState: 'recorded',
    processingError: null,
    isFavourite: false,
    version: 1,
    deviceId: 'd',
    ...overrides,
  }) as JournalEntry;

describe('describeStatus', () => {
  it('covers every processing state', () => {
    for (const state of PROCESSING_STATES) {
      expect(describeStatus(state).label).toBeTruthy();
    }
  });

  it('says "on device" while work is happening, which is the product promise', () => {
    expect(describeStatus('transcribing').label).toContain('on device');
    expect(describeStatus('analysing').label).toContain('on device');
  });

  it('marks in-flight states busy and terminal states not', () => {
    expect(describeStatus('transcribing').busy).toBe(true);
    expect(describeStatus('ready').busy).toBe(false);
    expect(describeStatus('failed').busy).toBe(false);
  });

  it('flags a failure without alarming language', () => {
    const status = describeStatus('failed');
    expect(status.tone).toBe('danger');
    expect(status.label).toBe('Needs attention');
  });
});

describe('previewOf', () => {
  it('prefers the summary once analysis has run', () => {
    const result = previewOf(
      entry({
        transcript: { text: 'raw words', language: 'en', provenance: { modelId: 'm', modelVersion: '1', generatedAt: 0 } },
        reflection: { title: null, summary: 'the summary', provenance: { modelId: 'm', modelVersion: '1', generatedAt: 0 } },
      }),
    );
    expect(result).toBe('the summary');
  });

  it('falls back to the transcript before analysis', () => {
    expect(
      previewOf(
        entry({
          transcript: { text: 'raw words', language: 'en', provenance: { modelId: 'm', modelVersion: '1', generatedAt: 0 } },
        }),
      ),
    ).toBe('raw words');
  });

  it('is null when there is nothing to show yet', () => {
    expect(previewOf(entry())).toBeNull();
  });
});

describe('formatEntryDate', () => {
  const now = new Date('2026-10-08T12:00:00Z').getTime();
  const daysAgo = (n: number) => now - n * 86_400_000;

  it('says Today and Yesterday', () => {
    expect(formatEntryDate(now, now)).toBe('Today');
    expect(formatEntryDate(daysAgo(1), now)).toBe('Yesterday');
  });

  it('counts days within the last week', () => {
    expect(formatEntryDate(daysAgo(3), now)).toBe('3 days ago');
  });

  it('falls back to a date beyond a week', () => {
    const label = formatEntryDate(daysAgo(30), now);
    expect(label).not.toContain('days ago');
    expect(label).toMatch(/\d/);
  });

  it('treats earlier the same day as Today, not 0 days ago', () => {
    const earlier = new Date('2026-10-08T01:00:00Z').getTime();
    expect(formatEntryDate(earlier, now)).toBe('Today');
  });
});

describe('formatClockTime', () => {
  it('renders a 24-hour time', () => {
    expect(formatClockTime(new Date('2026-10-08T09:05:00').getTime())).toMatch(/^\d{2}:\d{2}$/);
  });
});
