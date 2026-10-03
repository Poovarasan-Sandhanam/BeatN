import { Directory, File, Paths } from 'expo-file-system';
import {
  requestRecordingPermissionsAsync,
  useAudioStream,
  type AudioStreamBuffer,
} from 'expo-audio';
import { useCallback, useRef, useState } from 'react';

import {
  WHISPER_CHANNELS,
  WHISPER_SAMPLE_RATE,
  encodeWav,
  peakAmplitude,
  toWhisperPcm,
} from './pcm';

export interface WavRecording {
  /** file:// path to a 16 kHz mono 16-bit PCM WAV. */
  uri: string;
  durationMs: number;
  byteLength: number;
  /** Capture format the device actually gave us, before normalisation. */
  capturedSampleRate: number;
  capturedChannels: number;
}

export type RecorderState = 'idle' | 'recording' | 'finalising';

const RECORDINGS_DIRNAME = 'recordings';

function recordingsDirectory(): Directory {
  const directory = new Directory(Paths.document, RECORDINGS_DIRNAME);
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

/**
 * Captures microphone audio as raw PCM and finalises it to a WAV file.
 *
 * expo-audio's recorder presets only produce compressed containers on Android,
 * which whisper.rn cannot decode, so this goes through the PCM stream instead.
 * That also gives us live sample levels for the waveform.
 */
export function useWavRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [durationMs, setDurationMs] = useState(0);
  const [level, setLevel] = useState(0);

  const chunksRef = useRef<Int16Array[]>([]);
  const frameCountRef = useRef(0);
  const formatRef = useRef({ sampleRate: WHISPER_SAMPLE_RATE, channels: WHISPER_CHANNELS });

  const onBuffer = useCallback((buffer: AudioStreamBuffer) => {
    const interleaved = new Int16Array(buffer.data);
    formatRef.current = { sampleRate: buffer.sampleRate, channels: buffer.channels };

    const normalised = toWhisperPcm({
      samples: interleaved,
      sampleRate: buffer.sampleRate,
      channels: buffer.channels,
    });

    chunksRef.current.push(normalised);
    frameCountRef.current += normalised.length;

    setLevel(peakAmplitude(normalised));
    setDurationMs(Math.round((frameCountRef.current / WHISPER_SAMPLE_RATE) * 1000));
  }, []);

  const { stream } = useAudioStream({
    sampleRate: WHISPER_SAMPLE_RATE,
    channels: WHISPER_CHANNELS,
    encoding: 'int16',
    onBuffer,
  });

  const start = useCallback(async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      throw new Error('MICROPHONE_PERMISSION_DENIED');
    }

    chunksRef.current = [];
    frameCountRef.current = 0;
    setDurationMs(0);
    setLevel(0);

    await stream.start();
    setState('recording');
  }, [stream]);

  const stop = useCallback(async (): Promise<WavRecording> => {
    setState('finalising');
    stream.stop();
    setLevel(0);

    // Everything below runs inside try/finally. Without it, a failed
    // file.create() or file.write() — a full disk is the realistic case —
    // skipped setState('idle') and left the recorder wedged in 'finalising'
    // until the app was relaunched, which killed a whole benchmarking run.
    try {
      const chunks = chunksRef.current;
      chunksRef.current = [];

      const totalSamples = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      if (totalSamples === 0) {
        throw new Error('RECORDING_EMPTY');
      }

      const merged = new Int16Array(totalSamples);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      const wav = encodeWav(merged, WHISPER_SAMPLE_RATE, WHISPER_CHANNELS);
      const file = new File(recordingsDirectory(), `${Date.now()}.wav`);
      file.create({ overwrite: true });
      file.write(wav);

      return {
        uri: file.uri,
        durationMs: Math.round((totalSamples / WHISPER_SAMPLE_RATE) * 1000),
        byteLength: wav.byteLength,
        capturedSampleRate: formatRef.current.sampleRate,
        capturedChannels: formatRef.current.channels,
      };
    } finally {
      // The recorder is reusable whether or not this attempt succeeded.
      frameCountRef.current = 0;
      setState('idle');
    }
  }, [stream]);

  const cancel = useCallback(() => {
    stream.stop();
    chunksRef.current = [];
    frameCountRef.current = 0;
    setDurationMs(0);
    setLevel(0);
    setState('idle');
  }, [stream]);

  return { state, durationMs, level, start, stop, cancel };
}
