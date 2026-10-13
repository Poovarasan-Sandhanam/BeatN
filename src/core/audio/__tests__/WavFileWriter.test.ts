import { WAV_HEADER_BYTES, WavFileWriter, type ByteSink } from '../WavFileWriter';
import { WHISPER_SAMPLE_RATE } from '../pcm';

/** An in-memory file: records every write at the current offset. */
class MemorySink implements ByteSink {
  bytes: number[] = [];
  offset: number | null = 0;
  closed = false;
  writes = 0;

  writeBytes(data: Uint8Array): void {
    if (this.closed) throw new Error('WRITE_AFTER_CLOSE');
    this.writes += 1;
    const at = this.offset ?? 0;
    for (let i = 0; i < data.length; i += 1) this.bytes[at + i] = data[i];
    this.offset = at + data.length;
  }

  close(): void {
    this.closed = true;
  }

  view(): DataView {
    return new DataView(Uint8Array.from(this.bytes).buffer);
  }

  ascii(offset: number, length: number): string {
    return String.fromCharCode(...this.bytes.slice(offset, offset + length));
  }
}

const samples = (n: number, value = 1000) => new Int16Array(n).fill(value);

describe('WavFileWriter', () => {
  it('reserves a 44-byte header before any sample data', () => {
    const sink = new MemorySink();
    new WavFileWriter(sink).start();

    expect(sink.bytes.length).toBe(WAV_HEADER_BYTES);
    expect(sink.offset).toBe(WAV_HEADER_BYTES);
  });

  it('streams samples without buffering them', () => {
    const sink = new MemorySink();
    const writer = new WavFileWriter(sink);
    writer.start();

    writer.append(samples(100));
    writer.append(samples(100));

    // One write per append — nothing is held back.
    expect(sink.writes).toBe(3); // header + 2 appends
    expect(writer.frames).toBe(200);
  });

  it('rewrites the header in place with the final sizes', () => {
    const sink = new MemorySink();
    const writer = new WavFileWriter(sink);
    writer.start();
    writer.append(samples(1000));
    const result = writer.finish();

    const view = sink.view();
    expect(sink.ascii(0, 4)).toBe('RIFF');
    expect(sink.ascii(8, 4)).toBe('WAVE');
    expect(sink.ascii(36, 4)).toBe('data');

    // data chunk size = 1000 samples * 2 bytes
    expect(view.getUint32(40, true)).toBe(2000);
    // RIFF size = 36 + data
    expect(view.getUint32(4, true)).toBe(36 + 2000);
    expect(result.byteLength).toBe(WAV_HEADER_BYTES + 2000);
  });

  it('produces a file whose length matches the reported byte count', () => {
    const sink = new MemorySink();
    const writer = new WavFileWriter(sink);
    writer.start();
    writer.append(samples(512));
    writer.append(samples(512));
    const result = writer.finish();

    expect(sink.bytes.length).toBe(result.byteLength);
  });

  it('reports duration from the frame count', () => {
    const sink = new MemorySink();
    const writer = new WavFileWriter(sink);
    writer.start();
    writer.append(samples(WHISPER_SAMPLE_RATE * 3)); // exactly 3 seconds
    expect(writer.finish().durationMs).toBe(3000);
  });

  it('writes a valid empty file when nothing was recorded', () => {
    const sink = new MemorySink();
    const writer = new WavFileWriter(sink);
    writer.start();
    const result = writer.finish();

    expect(result.frameCount).toBe(0);
    expect(sink.view().getUint32(40, true)).toBe(0);
    expect(result.byteLength).toBe(WAV_HEADER_BYTES);
  });

  it('closes the sink on finish', () => {
    const sink = new MemorySink();
    const writer = new WavFileWriter(sink);
    writer.start();
    writer.finish();

    expect(sink.closed).toBe(true);
    expect(writer.isClosed).toBe(true);
  });

  it('ignores empty appends', () => {
    const sink = new MemorySink();
    const writer = new WavFileWriter(sink);
    writer.start();
    writer.append(new Int16Array(0));

    expect(sink.writes).toBe(1); // header only
    expect(writer.frames).toBe(0);
  });

  it('refuses to append before start', () => {
    expect(() => new WavFileWriter(new MemorySink()).append(samples(10))).toThrow(
      'WAV_WRITER_NOT_STARTED',
    );
  });

  it('refuses to start twice', () => {
    const writer = new WavFileWriter(new MemorySink());
    writer.start();
    expect(() => writer.start()).toThrow('WAV_WRITER_ALREADY_STARTED');
  });

  it('refuses to append or finish after closing', () => {
    const writer = new WavFileWriter(new MemorySink());
    writer.start();
    writer.finish();

    expect(() => writer.append(samples(10))).toThrow('WAV_WRITER_CLOSED');
    expect(() => writer.finish()).toThrow('WAV_WRITER_CLOSED');
  });

  it('abort closes without fixing the header, leaving the file detectably incomplete', () => {
    const sink = new MemorySink();
    const writer = new WavFileWriter(sink);
    writer.start();
    writer.append(samples(1000));
    writer.abort();

    expect(sink.closed).toBe(true);
    // Header still claims zero data despite 2000 bytes being present.
    expect(sink.view().getUint32(40, true)).toBe(0);
  });

  it('abort is idempotent', () => {
    const writer = new WavFileWriter(new MemorySink());
    writer.start();
    writer.abort();
    expect(() => writer.abort()).not.toThrow();
  });

  it('honours a non-default sample rate and channel count', () => {
    const sink = new MemorySink();
    const writer = new WavFileWriter(sink, 48_000, 2);
    writer.start();
    writer.append(samples(480));
    writer.finish();

    const view = sink.view();
    expect(view.getUint16(22, true)).toBe(2); // channels
    expect(view.getUint32(24, true)).toBe(48_000); // sample rate
  });
});
