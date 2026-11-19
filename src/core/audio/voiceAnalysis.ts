/**
 * Reads a saved recording and measures the voice in it.
 *
 * Only reads what it needs: up to six ten-second windows spread across the
 * file, so a ten-minute entry costs the same as a one-minute one — about a
 * minute of 16 kHz audio, well under a second of work. Yields between windows
 * so the UI never stalls behind it.
 */
import { File } from 'expo-file-system';

import { extractVoiceFeatures, sampleWindows, type VoiceFeatures } from '../../domain/voice/voiceFeatures';
import { WAV_HEADER_BYTES } from './WavFileWriter';

const WINDOW_SECONDS = 10;
const WINDOW_COUNT = 6;

const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

interface WavFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

/** Reads the canonical 44-byte header this app writes. Null for anything else. */
export function parseWavHeader(header: Uint8Array): WavFormat | null {
  if (header.length < WAV_HEADER_BYTES) return null;
  const text = (from: number) => String.fromCharCode(...header.subarray(from, from + 4));
  if (text(0) !== 'RIFF' || text(8) !== 'WAVE' || text(36) !== 'data') return null;
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  return {
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
  };
}

/** Little-endian 16-bit PCM bytes to samples, without assuming buffer alignment. */
export function bytesToSamples(bytes: Uint8Array): Int16Array {
  const samples = new Int16Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < samples.length; i += 1) {
    const value = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
    samples[i] = value >= 0x8000 ? value - 0x10000 : value;
  }
  return samples;
}

/**
 * Measures the voice in a recording. Null when the file is missing, not a
 * format this app wrote, or holds too little voice to judge. Never throws:
 * voice is an extra signal, and its absence must not fail an entry.
 */
export async function analyseVoice(uri: string): Promise<VoiceFeatures | null> {
  try {
    const file = new File(uri);
    if (!file.exists) return null;

    const handle = file.open();
    try {
      const format = parseWavHeader(handle.readBytes(WAV_HEADER_BYTES));
      if (!format || format.bitsPerSample !== 16 || format.channels !== 1) return null;

      const totalSamples = Math.floor((file.size - WAV_HEADER_BYTES) / 2);
      const windows = sampleWindows(totalSamples, WINDOW_SECONDS * format.sampleRate, WINDOW_COUNT);

      const parts: Int16Array[] = [];
      for (const [start, length] of windows) {
        handle.offset = WAV_HEADER_BYTES + start * 2;
        parts.push(bytesToSamples(handle.readBytes(length * 2)));
        await yieldToEventLoop();
      }

      const samples = new Int16Array(parts.reduce((n, part) => n + part.length, 0));
      let offset = 0;
      for (const part of parts) {
        samples.set(part, offset);
        offset += part.length;
      }
      return extractVoiceFeatures(samples, format.sampleRate);
    } finally {
      handle.close();
    }
  } catch {
    return null;
  }
}
