import type { JournalEntry } from '../../../domain/entry/JournalEntry';
import {
  entryToRow,
  parseEntityKind,
  parseMood,
  parseProcessingState,
  rowToEntity,
  rowToEntry,
  rowToTopic,
  type JournalEntryRow,
} from '../mappers';
import { RowMappingError } from '../types';

const bareRow: JournalEntryRow = {
  id: '0193b0f0-0000-7000-8000-000000000001',
  created_at: 1_735_689_600_000,
  updated_at: 1_735_689_600_000,
  deleted_at: null,
  audio_uri: 'file:///recordings/1.wav',
  audio_duration_ms: 30_000,
  audio_sample_rate: 16_000,
  audio_channels: 1,
  audio_byte_length: 960_044,
  transcript_text: null,
  transcript_language: null,
  transcript_model_id: null,
  transcript_model_version: null,
  transcript_generated_at: null,
  title: null,
  summary: null,
  reflection_model_id: null,
  reflection_model_version: null,
  reflection_prompt_version: null,
  reflection_generated_at: null,
  mood: null,
  mood_confidence: null,
  mood_model_id: null,
  mood_model_version: null,
  mood_generated_at: null,
  processing_state: 'recorded',
  processing_error: null,
  is_favourite: 0,
  version: 1,
  device_id: 'device-a',
};

const fullRow: JournalEntryRow = {
  ...bareRow,
  transcript_text: 'I think I want to change careers.',
  transcript_language: 'en',
  transcript_model_id: 'whisper-base-en-q5_1',
  transcript_model_version: '1',
  transcript_generated_at: 1_735_689_610_000,
  title: 'Career thoughts',
  summary: 'You are weighing up a change of direction.',
  reflection_model_id: 'qwen2.5-1.5b',
  reflection_model_version: '1',
  reflection_prompt_version: 'analysis-v1',
  reflection_generated_at: 1_735_689_620_000,
  mood: 'reflective',
  mood_confidence: 0.72,
  mood_model_id: 'qwen2.5-1.5b',
  mood_model_version: '1',
  mood_generated_at: 1_735_689_620_000,
  processing_state: 'ready',
  is_favourite: 1,
  version: 4,
};

describe('parsers reject values the domain does not allow', () => {
  it('accepts a legal processing state', () => {
    expect(parseProcessingState('analysing')).toBe('analysing');
  });

  it('throws RowMappingError on an unknown processing state', () => {
    expect(() => parseProcessingState('teleporting')).toThrow(RowMappingError);
    expect(() => parseProcessingState('teleporting')).toThrow(
      'ROW_MAPPING_FAILED:journal_entries.processing_state',
    );
  });

  it('throws on an unknown mood rather than casting it through', () => {
    expect(() => parseMood('ecstatic')).toThrow(RowMappingError);
  });

  it('throws on an unknown entity kind', () => {
    expect(() => parseEntityKind('spaceship')).toThrow(RowMappingError);
  });

  it('accepts every legal entity kind', () => {
    for (const kind of ['person', 'place', 'organisation']) {
      expect(parseEntityKind(kind)).toBe(kind);
    }
  });
});

describe('rowToEntry', () => {
  it('leaves derived sections null before the AI has run', () => {
    const entry = rowToEntry(bareRow);
    expect(entry.transcript).toBeNull();
    expect(entry.reflection).toBeNull();
    expect(entry.mood).toBeNull();
    expect(entry.processingState).toBe('recorded');
  });

  it('always maps the audio reference, even for an unprocessed entry', () => {
    expect(rowToEntry(bareRow).audio).toEqual({
      uri: 'file:///recordings/1.wav',
      durationMs: 30_000,
      sampleRate: 16_000,
      channels: 1,
      byteLength: 960_044,
    });
  });

  it('maps a fully processed entry with provenance on each derived field', () => {
    const entry = rowToEntry(fullRow);

    expect(entry.transcript?.text).toBe('I think I want to change careers.');
    expect(entry.transcript?.provenance.modelId).toBe('whisper-base-en-q5_1');
    expect(entry.reflection?.summary).toBe('You are weighing up a change of direction.');
    expect(entry.reflection?.provenance.promptVersion).toBe('analysis-v1');
    expect(entry.mood?.value).toBe('reflective');
    expect(entry.mood?.confidence).toBeCloseTo(0.72);
  });

  it('converts the integer favourite flag to a boolean', () => {
    expect(rowToEntry(bareRow).isFavourite).toBe(false);
    expect(rowToEntry(fullRow).isFavourite).toBe(true);
  });

  it('does not build a transcript when provenance is missing', () => {
    // A text column without provenance means a partial write; prefer null to a lie.
    const entry = rowToEntry({ ...fullRow, transcript_model_id: null });
    expect(entry.transcript).toBeNull();
  });

  it('attaches topics and entities that were passed in', () => {
    const entry = rowToEntry(
      fullRow,
      [{ name: 'career', confidence: 0.9 }],
      [{ kind: 'person', name: 'Sam', confidence: 0.8 }],
    );
    expect(entry.topics).toHaveLength(1);
    expect(entry.entities[0].kind).toBe('person');
  });

  it('defaults topics and entities to empty rather than undefined', () => {
    const entry = rowToEntry(bareRow);
    expect(entry.topics).toEqual([]);
    expect(entry.entities).toEqual([]);
  });
});

describe('entryToRow', () => {
  it('round-trips a fully processed entry', () => {
    const entry = rowToEntry(fullRow);
    expect(entryToRow(entry)).toEqual(fullRow);
  });

  it('round-trips an unprocessed entry', () => {
    const entry = rowToEntry(bareRow);
    expect(entryToRow(entry)).toEqual(bareRow);
  });

  it('writes a boolean favourite back as 0 or 1', () => {
    const entry: JournalEntry = { ...rowToEntry(bareRow), isFavourite: true };
    expect(entryToRow(entry).is_favourite).toBe(1);
  });

  it('preserves a soft-delete tombstone', () => {
    const entry: JournalEntry = { ...rowToEntry(bareRow), deletedAt: 1_735_700_000_000 };
    expect(entryToRow(entry).deleted_at).toBe(1_735_700_000_000);
  });
});

describe('row helpers', () => {
  it('maps a topic row', () => {
    expect(rowToTopic({ entry_id: 'e1', name: 'career', confidence: 0.9 })).toEqual({
      name: 'career',
      confidence: 0.9,
    });
  });

  it('maps an entity row and validates its kind', () => {
    expect(rowToEntity({ entry_id: 'e1', kind: 'place', name: 'Leeds', confidence: 0.6 })).toEqual({
      kind: 'place',
      name: 'Leeds',
      confidence: 0.6,
    });
  });
});
