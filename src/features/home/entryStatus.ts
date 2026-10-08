import type { JournalEntry, ProcessingState } from '../../domain/entry/JournalEntry';

export interface EntryStatus {
  label: string;
  tone: 'muted' | 'accent' | 'danger' | 'success';
  /** Whether work is still in flight, so the UI can show motion. */
  busy: boolean;
}

/**
 * Processing state as the user should read it.
 *
 * The wording is deliberate: "on device" is said twice, because that is the
 * product's whole promise and this is the moment the user is waiting and
 * therefore actually reading.
 */
export function describeStatus(state: ProcessingState): EntryStatus {
  switch (state) {
    case 'recorded':
      return { label: 'Saved', tone: 'muted', busy: true };
    case 'transcribing':
      return { label: 'Transcribing on device', tone: 'accent', busy: true };
    case 'transcribed':
    case 'analysing':
      return { label: 'Understanding on device', tone: 'accent', busy: true };
    case 'analysed':
    case 'embedding':
    case 'indexed':
    case 'extracting_memories':
      return { label: 'Finishing up', tone: 'accent', busy: true };
    case 'ready':
      return { label: 'Ready', tone: 'success', busy: false };
    case 'failed':
      return { label: 'Needs attention', tone: 'danger', busy: false };
  }
}

/** One line for the list: the summary if we have it, else the transcript. */
export function previewOf(entry: JournalEntry): string | null {
  if (entry.reflection?.summary) return entry.reflection.summary;
  if (entry.transcript?.text) return entry.transcript.text;
  return null;
}

/** "Today", "Yesterday", or a date — relative to `now` so it is testable. */
export function formatEntryDate(timestamp: number, now: number = Date.now()): string {
  const startOfDay = (ms: number) => {
    const date = new Date(ms);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };

  const days = Math.round((startOfDay(now) - startOfDay(timestamp)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;

  return new Date(timestamp).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: startOfDay(now) - startOfDay(timestamp) > 365 * 86_400_000 ? 'numeric' : undefined,
  });
}

export function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
