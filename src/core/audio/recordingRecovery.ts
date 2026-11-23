/**
 * Finds recordings on disk that never made it into the journal, so they can
 * be added at launch. A recording must never be lost to a crash, a kill while
 * paused, or the OS reclaiming the app mid-sentence.
 *
 * Also repairs the one way a recording file can be left broken: killed while
 * recording, before the header was rewritten, so it still says "0 bytes of
 * audio" though the audio is all there. The real size is the file size.
 */
import { File } from 'expo-file-system';

import { buildWavHeader } from './pcm';
import { recordingsDirectory } from './recordingsFolder';
import { parseWavHeader } from './voiceAnalysis';
import { WAV_HEADER_BYTES } from './WavFileWriter';
import type { WavRecording } from './useWavRecorder';

/** Shorter than this is a false start, not an entry. */
const MIN_RECOVERABLE_MS = 1_000;

export interface FoundRecording extends WavRecording {
  /** When recording started — from the file name, which is its start time. */
  createdAt: number;
  /** True when the header had to be rewritten to make the file playable. */
  repaired: boolean;
}

/**
 * Pure: what the header should say, given the file's real size. Null when the
 * header is already right. Only whole 16-bit samples count.
 */
export function headerRepairFor(fileSize: number, headerDataBytes: number): number | null {
  const actual = Math.floor((fileSize - WAV_HEADER_BYTES) / 2) * 2;
  if (actual <= 0) return null;
  return headerDataBytes === actual ? null : actual;
}

/** Recording files are named `${Date.now()}.wav` when they start. */
export function startTimeFromName(name: string): number | null {
  const match = /^(\d{12,14})\.wav$/.exec(name);
  return match ? Number(match[1]) : null;
}

/**
 * Every playable journal recording on disk, with broken headers fixed in
 * place. Never throws: one unreadable file must not hide the rest.
 */
export function findRecordings(): FoundRecording[] {
  let files: File[];
  try {
    files = recordingsDirectory()
      .list()
      .filter((item): item is File => item instanceof File && item.name.endsWith('.wav'));
  } catch {
    return [];
  }

  const found: FoundRecording[] = [];
  for (const file of files) {
    try {
      const createdAt = startTimeFromName(file.name);
      if (createdAt === null || file.size <= WAV_HEADER_BYTES) continue;

      const handle = file.open();
      let format;
      let repaired = false;
      try {
        const header = handle.readBytes(WAV_HEADER_BYTES);
        format = parseWavHeader(header);
        if (!format || format.bitsPerSample !== 16) continue;

        const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
        const fixedSize = headerRepairFor(file.size, view.getUint32(40, true));
        if (fixedSize !== null) {
          handle.offset = 0;
          handle.writeBytes(buildWavHeader(fixedSize, format.sampleRate, format.channels));
          repaired = true;
        }
      } finally {
        handle.close();
      }

      const dataBytes = Math.floor((file.size - WAV_HEADER_BYTES) / 2) * 2;
      const durationMs = Math.round((dataBytes / 2 / format.channels / format.sampleRate) * 1000);
      if (durationMs < MIN_RECOVERABLE_MS) continue;

      found.push({
        uri: file.uri,
        durationMs,
        byteLength: WAV_HEADER_BYTES + dataBytes,
        capturedSampleRate: format.sampleRate,
        capturedChannels: format.channels,
        createdAt,
        repaired,
      });
    } catch {
      // Unreadable (locked, half-deleted): skip it, try again next launch.
    }
  }
  return found;
}
