/**
 * Streams PCM to a WAV file as it arrives.
 *
 * Replaces accumulating the whole recording in memory. The old path held the
 * samples, then merged them into one array, then built a WAV from that —
 * roughly 3× the recording at peak. A ten-minute entry is ~19 MB of PCM, so
 * ~57 MB transient, on a phone that may also be holding a 1.1 GB model.
 *
 * The trick is that a RIFF header needs the final byte count, which is not
 * known until the end. So a 44-byte placeholder is written first, samples are
 * appended, and the header is rewritten in place at the close by seeking back
 * to offset 0. Memory stays flat regardless of duration.
 */

import { buildWavHeader, WHISPER_CHANNELS, WHISPER_SAMPLE_RATE } from './pcm';

/** The slice of expo-file-system's FileHandle this needs. */
export interface ByteSink {
  writeBytes(bytes: Uint8Array): void;
  /** Settable — this is what makes rewriting the header possible. */
  offset: number | null;
  close(): void;
}

export const WAV_HEADER_BYTES = 44;

export class WavFileWriter {
  private frameCount = 0;
  private started = false;
  private closed = false;

  constructor(
    private readonly sink: ByteSink,
    private readonly sampleRate: number = WHISPER_SAMPLE_RATE,
    private readonly channels: number = WHISPER_CHANNELS,
  ) {}

  get frames(): number {
    return this.frameCount;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** Reserve the header so sample data starts at the right offset. */
  start(): void {
    if (this.started) throw new Error('WAV_WRITER_ALREADY_STARTED');
    this.started = true;
    this.sink.writeBytes(buildWavHeader(0, this.sampleRate, this.channels));
  }

  append(samples: Int16Array): void {
    if (!this.started) throw new Error('WAV_WRITER_NOT_STARTED');
    if (this.closed) throw new Error('WAV_WRITER_CLOSED');
    if (samples.length === 0) return;

    // A view over the same memory — no copy. Little-endian on every platform
    // React Native runs on, which is what WAV requires.
    this.sink.writeBytes(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength));
    this.frameCount += samples.length;
  }

  /**
   * Rewrite the header with the real sizes and close.
   *
   * Returns the finished file's byte length so the caller does not have to
   * stat it.
   */
  finish(): { byteLength: number; frameCount: number; durationMs: number } {
    if (!this.started) throw new Error('WAV_WRITER_NOT_STARTED');
    if (this.closed) throw new Error('WAV_WRITER_CLOSED');

    const dataByteLength = this.frameCount * 2; // 16-bit samples

    this.sink.offset = 0;
    this.sink.writeBytes(buildWavHeader(dataByteLength, this.sampleRate, this.channels));
    this.sink.close();
    this.closed = true;

    return {
      byteLength: WAV_HEADER_BYTES + dataByteLength,
      frameCount: this.frameCount,
      durationMs: Math.round((this.frameCount / this.sampleRate) * 1000),
    };
  }

  /** Close without fixing the header. The file is incomplete and should be deleted. */
  abort(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.sink.close();
    } catch {
      // Already closed by the platform; nothing useful to do.
    }
  }
}
