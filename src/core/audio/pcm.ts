/**
 * PCM helpers for producing the exact audio format whisper.cpp expects:
 * 16 kHz, mono, signed 16-bit little-endian PCM in a RIFF/WAVE container.
 *
 * whisper.rn does not decode compressed audio, so the capture path has to
 * deliver raw PCM itself rather than relying on a platform encoder.
 */

export const WHISPER_SAMPLE_RATE = 16000;
export const WHISPER_CHANNELS = 1;

/** Interleaved int16 frames straight off the native audio stream. */
export interface PcmChunk {
  samples: Int16Array;
  sampleRate: number;
  channels: number;
}

/** Average interleaved channels down to a single channel. */
export function downmixToMono(samples: Int16Array, channels: number): Int16Array {
  if (channels <= 1) return samples;

  const frames = Math.floor(samples.length / channels);
  const mono = new Int16Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += samples[frame * channels + channel];
    }
    mono[frame] = (sum / channels) | 0;
  }
  return mono;
}

/**
 * Linear resample. Speech at 16 kHz does not need a polyphase filter to be
 * intelligible to Whisper, and this only runs when the device refused the
 * requested capture rate.
 */
export function resampleLinear(samples: Int16Array, from: number, to: number): Int16Array {
  if (from === to || samples.length === 0) return samples;

  const ratio = from / to;
  const outLength = Math.max(1, Math.floor(samples.length / ratio));
  const out = new Int16Array(outLength);

  for (let i = 0; i < outLength; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const weight = position - left;
    out[i] = (samples[left] * (1 - weight) + samples[right] * weight) | 0;
  }
  return out;
}

/** Normalise arbitrary captured PCM to Whisper's required 16 kHz mono. */
export function toWhisperPcm(chunk: PcmChunk): Int16Array {
  const mono = downmixToMono(chunk.samples, chunk.channels);
  return resampleLinear(mono, chunk.sampleRate, WHISPER_SAMPLE_RATE);
}

/** Build a 44-byte canonical RIFF/WAVE header for 16-bit PCM. */
export function buildWavHeader(
  dataByteLength: number,
  sampleRate: number = WHISPER_SAMPLE_RATE,
  channels: number = WHISPER_CHANNELS,
): Uint8Array {
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;

  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(8, 'WAVE');

  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM subchunk size
  view.setUint16(20, 1, true); // audio format: PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  writeAscii(36, 'data');
  view.setUint32(40, dataByteLength, true);

  return new Uint8Array(header);
}

/** Concatenate header + samples into a complete in-memory WAV file. */
export function encodeWav(
  samples: Int16Array,
  sampleRate: number = WHISPER_SAMPLE_RATE,
  channels: number = WHISPER_CHANNELS,
): Uint8Array {
  const pcm = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  const header = buildWavHeader(pcm.byteLength, sampleRate, channels);

  const wav = new Uint8Array(header.byteLength + pcm.byteLength);
  wav.set(header, 0);
  wav.set(pcm, header.byteLength);
  return wav;
}

/** Peak amplitude in 0..1, used to drive the recording waveform. */
export function peakAmplitude(samples: Int16Array): number {
  let peak = 0;
  // Sparse scan: a 100 ms buffer is ~1600 frames and the UI only needs a level.
  const step = Math.max(1, Math.floor(samples.length / 256));
  for (let i = 0; i < samples.length; i += step) {
    const magnitude = Math.abs(samples[i]);
    if (magnitude > peak) peak = magnitude;
  }
  return Math.min(1, peak / 32768);
}
