import { File, FileMode } from 'expo-file-system';
import {
  requestRecordingPermissionsAsync,
  useAudioStream,
  type AudioStreamBuffer,
} from 'expo-audio';
import { useCallback, useRef, useState } from 'react';

import { LevelHistogram, MIN_USEFUL_GAIN, meterLevel, normalisationGain } from './loudness';
import { normaliseRecording } from './normaliseRecording';
import { WHISPER_CHANNELS, WHISPER_SAMPLE_RATE, peakAmplitude, toWhisperPcm } from './pcm';
import { RECORDINGS_DIRNAME, recordingsDirectory } from './recordingsFolder';
import { WavFileWriter } from './WavFileWriter';
import { prepareForPlayback, prepareForRecording } from './audioSession';

export interface WavRecording {
  /** file:// path to a 16 kHz mono 16-bit PCM WAV. */
  uri: string;
  durationMs: number;
  byteLength: number;
  /** Capture format the device actually gave us, before normalisation. */
  capturedSampleRate: number;
  capturedChannels: number;
}

export type RecorderState = 'idle' | 'recording' | 'paused' | 'finalising';


/**
 * Captures microphone audio as raw PCM and finalises it to a WAV file.
 *
 * expo-audio's recorder presets only produce compressed containers on Android,
 * which whisper.rn cannot decode, so this goes through the PCM stream instead.
 * That also gives us live sample levels for the waveform.
 */
export interface WavRecorderOptions {
  /**
   * Folder under Documents. Journal recordings use the default; anything else
   * (developer benchmarks) must use its own, or launch-time recovery would
   * turn it into journal entries.
   */
  directoryName?: string;
}

export function useWavRecorder({ directoryName = RECORDINGS_DIRNAME }: WavRecorderOptions = {}) {
  const [state, setState] = useState<RecorderState>('idle');
  const [durationMs, setDurationMs] = useState(0);
  const [level, setLevel] = useState(0);

  // Samples go straight to disk. Nothing accumulates in memory, so a
  // ten-minute entry costs the same as a ten-second one.
  const writerRef = useRef<WavFileWriter | null>(null);
  const fileRef = useRef<File | null>(null);
  const frameCountRef = useRef(0);
  // How loud this recording gets, tracked as it is written, so the gain is
  // known at stop without reading the whole file back.
  const levelsRef = useRef<LevelHistogram | null>(null);
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

    levelsRef.current?.add(normalised);
    // Decibel scale: raw speech sits around -50 dBFS and would barely move a linear meter.
    setLevel(meterLevel(peakAmplitude(normalised)));
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
    levelsRef.current = new LevelHistogram();
    setDurationMs(0);
    setLevel(0);

    // The file is created now, not at stop: samples are written as they
    // arrive, so there has to be somewhere to put them.
    const file = new File(recordingsDirectory(directoryName), `${Date.now()}.wav`);
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
      await prepareForRecording();
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
  }, [stream, directoryName]);

  /**
   * Stops listening but keeps the recording open. The file is checkpointed,
   * so if the app is killed while paused what was said survives as a valid
   * recording (see `recoverUnsavedRecordings`).
   */
  const pause = useCallback(() => {
    if (!writerRef.current) return;
    stream.stop();
    try {
      writerRef.current.checkpoint();
    } catch {
      // The OS may have locked the file already; resume or stop will retry.
    }
    setLevel(0);
    setState('paused');
  }, [stream]);

  /** Starts listening again, appending to the same recording. */
  const resume = useCallback(async () => {
    if (!writerRef.current) return;
    await prepareForRecording();
    await stream.start();
    setState('recording');
  }, [stream]);

  const stop = useCallback(async (): Promise<WavRecording> => {
    setState('finalising');
    stream.stop();
    // Hand the session back for listening, or playback lands on the earpiece.
    void prepareForPlayback();
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

      // Bring quiet raw-mic audio up to a normal listening level — for
      // playback, for transcription, and for voice analysis. Best effort:
      // a recording that cannot be boosted is still a recording.
      const gain = levelsRef.current ? normalisationGain(levelsRef.current) : 1;
      if (gain >= MIN_USEFUL_GAIN) {
        await normaliseRecording(file, gain).catch(() => {});
      }

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
    void prepareForPlayback();

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

  return { state, durationMs, level, start, pause, resume, stop, cancel };
}
