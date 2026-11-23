/**
 * Applies a gain to a finished WAV file in place, chunk by chunk.
 *
 * In place and streamed for the same reason the writer is: a ten-minute entry
 * is ~19 MB, and the phone may also be holding a 1.1 GB model. Memory stays at
 * one chunk regardless of length; yielding between chunks keeps the UI live.
 */
import type { File } from 'expo-file-system';

import { applyGain } from './loudness';
import { bytesToSamples } from './voiceAnalysis';
import { WAV_HEADER_BYTES } from './WavFileWriter';

const CHUNK_BYTES = 64 * 1024;

const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function normaliseRecording(file: File, gain: number): Promise<void> {
  const total = file.size;
  const handle = file.open();
  try {
    for (let position = WAV_HEADER_BYTES; position < total; position += CHUNK_BYTES) {
      const length = Math.min(CHUNK_BYTES, total - position) & ~1; // whole samples
      if (length <= 0) break;

      handle.offset = position;
      const samples = bytesToSamples(handle.readBytes(length));
      applyGain(samples, gain);

      handle.offset = position;
      // Little-endian on every platform React Native runs on, as WAV requires.
      handle.writeBytes(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength));
      await yieldToEventLoop();
    }
  } finally {
    handle.close();
  }
}
