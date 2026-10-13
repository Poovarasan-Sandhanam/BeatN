import { Directory, File, FileMode, Paths } from 'expo-file-system';
import {
  requestRecordingPermissionsAsync,
  useAudioStream,
  type AudioStreamBuffer,
} from 'expo-audio';
import { useCallback, useRef, useState } from 'react';

import { WHISPER_CHANNELS, WHISPER_SAMPLE_RATE, peakAmplitude, toWhisperPcm } from './pcm';
import { WavFileWriter } from './WavFileWriter';

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

  // Samples go straight to disk. Nothing accumulates in memory, so a
  // ten-minute entry costs the same as a ten-second one.
  const writerRef = useRef<WavFileWriter | null>(null);
  const fileRef = useRef<File | null>(null);
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

    writerRef.current?.append(normalised);
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

    frameCountRef.current = 0;
    setDurationMs(0);
    setLevel(0);

    // The file is created now, not at stop: samples are written as they
    // arrive, so there has to be somewhere to put them.
    const file = new File(recordingsDirectory(), `${Date.now()}.wav`);
    file.create({ overwrite: true });
    const writer = new WavFileWriter(
      file.open(FileMode.ReadWrite),
      WHISPER_SAMPLE_RATE,
      WHISPER_CHANNELS,
    );
    writer.start();
    fileRef.current = file;
    writerRef.current = writer;

    try {
      await stream.start();
    } catch (error) {
      // Do not leave a stray zero-length file behind.
      writer.abort();
      file.delete();
      writerRef.current = null;
      fileRef.current = null;
      throw error;
    }

    setState('recording');
  }, [stream]);

  const stop = useCallback(async (): Promise<WavRecording> => {
    setState('finalising');
    stream.stop();
    setLevel(0);

    const writer = writerRef.current;
    const file = fileRef.current;
    writerRef.current = null;
    fileRef.current = null;

    // try/finally: a failed finalise must still return the recorder to idle,
    // or it wedges until the app is relaunched.
    try {
      if (!writer || !file) throw new Error('RECORDING_EMPTY');

      if (writer.frames === 0) {
        writer.abort();
        file.delete();
        throw new Error('RECORDING_EMPTY');
      }

      const { byteLength, durationMs: recordedMs } = writer.finish();

      return {
        uri: file.uri,
        durationMs: recordedMs,
        byteLength,
        capturedSampleRate: formatRef.current.sampleRate,
        capturedChannels: formatRef.current.channels,
      };
    } finally {
      frameCountRef.current = 0;
      setState('idle');
    }
  }, [stream]);

  const cancel = useCallback(() => {
    stream.stop();

    // A cancelled recording leaves a file with a placeholder header, so it is
    // deleted rather than left for the orphan reaper to find.
    writerRef.current?.abort();
    try {
      fileRef.current?.delete();
    } catch {
      // Already gone, or never created.
    }
    writerRef.current = null;
    fileRef.current = null;

    frameCountRef.current = 0;
    setDurationMs(0);
    setLevel(0);
    setState('idle');
  }, [stream]);

  return { state, durationMs, level, start, stop, cancel };
}
