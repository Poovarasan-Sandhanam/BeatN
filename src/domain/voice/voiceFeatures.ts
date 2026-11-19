/**
 * How someone sounded, measured from the raw audio.
 *
 * Words say *what* someone feels; the voice carries *how much* — energy,
 * tension, flatness. These measurements are the classic prosodic correlates of
 * emotional arousal: loudness, pitch level and movement, pace, and pauses.
 * They say little about whether a feeling is good or bad, which is why the
 * words still decide that (see `voiceCues.ts`).
 *
 * Pure TypeScript over PCM samples: no audio library, no native code, and
 * every number here is reproducible in a unit test with a synthetic tone.
 */

export interface VoiceFeatures {
  /** Bumped if a measurement's definition changes, so old rows can be ignored. */
  version: 1;
  /** Seconds of audio actually analysed (long recordings are sampled). */
  analysedSeconds: number;
  /** Share of analysed frames that contained voice, 0..1. */
  voicedRatio: number;
  /** Median loudness of voiced frames, dBFS. Depends on mic distance — compare to self only. */
  loudnessDb: number;
  /** Spread of loudness across voiced frames (interquartile range, dB). */
  loudnessVariationDb: number;
  /** Median fundamental frequency, Hz. */
  pitchHz: number | null;
  /** Spread of pitch (interquartile range, semitones). Low reads as flat or monotone. */
  pitchVariationSemitones: number | null;
  /** Share of the speaking span spent in pauses of a quarter second or more, 0..1. */
  pauseRatio: number;
  /** From the transcript; null until words are known. */
  wordsPerMinute: number | null;
  /** Share of the analysed audio between the first and last voiced frame, 0..1. */
  speechSpanRatio: number;
}

const FRAME_SECONDS = 0.032;
const HOP_SECONDS = 0.016;
/** Pitch is searched at 8 kHz: plenty for a voice, and 4× cheaper than 16 kHz. */
const PITCH_RATE = 8000;
/** Covers deep male to high female speaking voices. */
const MIN_PITCH_HZ = 70;
const MAX_PITCH_HZ = 400;
/** Normalised autocorrelation below this is noise or a consonant, not a pitch. */
const MIN_PERIODICITY = 0.55;
const MIN_PAUSE_SECONDS = 0.25;
/** Nothing quieter than this is treated as voice, however quiet the room. */
const SILENCE_DBFS = -50;
/** Below this, there is not enough voice to say anything. */
const MIN_VOICED_FRAMES = 12;

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

const ascending = (values: number[]) => [...values].sort((a, b) => a - b);
const iqr = (sorted: number[]) => percentile(sorted, 0.75) - percentile(sorted, 0.25);

function frameDb(samples: Int16Array, start: number, length: number): number {
  let sum = 0;
  for (let i = start; i < start + length; i += 1) {
    const value = samples[i] / 32768;
    sum += value * value;
  }
  const rms = Math.sqrt(sum / length);
  return 20 * Math.log10(rms + 1e-9);
}

/**
 * Fundamental frequency of one frame by normalised autocorrelation, or null
 * when the frame is not clearly periodic. Downsampled first: a voice's pitch
 * is far below 4 kHz, and the search cost scales with the sample rate squared.
 */
export function detectPitch(
  samples: Int16Array,
  start: number,
  length: number,
  sampleRate: number,
): number | null {
  const step = Math.max(1, Math.floor(sampleRate / PITCH_RATE));
  const rate = sampleRate / step;
  const n = Math.floor(length / step);
  const frame = new Float32Array(n);
  let mean = 0;
  for (let i = 0; i < n; i += 1) {
    // Averaging each block is a cheap low-pass before decimating.
    let sum = 0;
    for (let k = 0; k < step; k += 1) sum += samples[start + i * step + k];
    frame[i] = sum / step;
    mean += frame[i];
  }
  mean /= n;
  for (let i = 0; i < n; i += 1) frame[i] -= mean;

  const minLag = Math.floor(rate / MAX_PITCH_HZ);
  const maxLag = Math.min(Math.ceil(rate / MIN_PITCH_HZ), n - 2);
  if (maxLag <= minLag) return null;

  const scores = new Float32Array(maxLag + 2);
  let best = 0;
  for (let lag = minLag; lag <= maxLag + 1; lag += 1) {
    let cross = 0;
    let energyA = 0;
    let energyB = 0;
    for (let i = 0; i + lag < n; i += 1) {
      cross += frame[i] * frame[i + lag];
      energyA += frame[i] * frame[i];
      energyB += frame[i + lag] * frame[i + lag];
    }
    const score = energyA > 0 && energyB > 0 ? cross / Math.sqrt(energyA * energyB) : 0;
    scores[lag] = score;
    if (lag <= maxLag && score > best) best = score;
  }
  if (best < MIN_PERIODICITY) return null;

  // A pitch also correlates at 2× and 3× its period. Taking the shortest lag
  // that is nearly as strong as the best avoids reporting half the pitch.
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const isPeak = scores[lag] >= scores[lag - 1] && scores[lag] >= scores[lag + 1];
    if (isPeak && scores[lag] >= best * 0.9) {
      // Parabolic interpolation sharpens the integer lag to sub-sample precision.
      const a = scores[lag - 1];
      const b = scores[lag];
      const c = scores[lag + 1];
      const denominator = a - 2 * b + c;
      const offset = denominator === 0 ? 0 : (0.5 * (a - c)) / denominator;
      return rate / (lag + offset);
    }
  }
  return null;
}

/**
 * Measures a recording. Null when it holds too little voice to judge.
 * Pass the audio as 16-bit mono PCM; long recordings should be sampled by the
 * caller first (see `sampleWindows`) to keep the cost bounded.
 */
export function extractVoiceFeatures(samples: Int16Array, sampleRate: number): VoiceFeatures | null {
  const frameLength = Math.round(sampleRate * FRAME_SECONDS);
  const hop = Math.round(sampleRate * HOP_SECONDS);
  if (samples.length < frameLength * 4) return null;

  const dbs: number[] = [];
  for (let start = 0; start + frameLength <= samples.length; start += hop) {
    dbs.push(frameDb(samples, start, frameLength));
  }

  // Voice is whatever stands well clear of this recording's own noise floor,
  // so a quiet room and a busy street are judged on the same terms.
  const sortedDbs = ascending(dbs);
  const noiseFloor = percentile(sortedDbs, 0.1);
  // Capped just under the median, so speech with no gaps at all — where the
  // "floor" is the voice itself — still counts as voice. And never below
  // -50 dBFS, so a silent recording is never mistaken for speech.
  const threshold = Math.max(
    Math.min(Math.max(noiseFloor + 10, -55), percentile(sortedDbs, 0.5) - 3),
    SILENCE_DBFS,
  );
  const voiced = dbs.map((db) => db >= threshold);

  const voicedIndexes: number[] = [];
  voiced.forEach((isVoiced, index) => {
    if (isVoiced) voicedIndexes.push(index);
  });
  if (voicedIndexes.length < MIN_VOICED_FRAMES) return null;

  const voicedDbs = ascending(voicedIndexes.map((index) => dbs[index]));

  const pitches: number[] = [];
  for (const index of voicedIndexes) {
    const pitch = detectPitch(samples, index * hop, frameLength, sampleRate);
    if (pitch !== null) pitches.push(pitch);
  }
  // Loud but never periodic is a fan, traffic or rustling — spoken vowels
  // always carry a pitch. Without one, there is no voice here to describe.
  if (pitches.length < MIN_VOICED_FRAMES / 2) return null;
  const medianPitch = percentile(ascending(pitches), 0.5);
  const pitchVariation = iqr(ascending(pitches.map((pitch) => 12 * Math.log2(pitch / medianPitch))));

  const first = voicedIndexes[0];
  const last = voicedIndexes[voicedIndexes.length - 1];
  const spanFrames = last - first + 1;
  const minPauseFrames = Math.ceil(MIN_PAUSE_SECONDS / HOP_SECONDS);
  let pauseFrames = 0;
  let run = 0;
  for (let index = first; index <= last; index += 1) {
    if (voiced[index]) {
      if (run >= minPauseFrames) pauseFrames += run;
      run = 0;
    } else {
      run += 1;
    }
  }

  return {
    version: 1,
    analysedSeconds: samples.length / sampleRate,
    voicedRatio: voicedIndexes.length / dbs.length,
    loudnessDb: percentile(voicedDbs, 0.5),
    loudnessVariationDb: iqr(voicedDbs),
    pitchHz: medianPitch,
    pitchVariationSemitones: pitchVariation,
    pauseRatio: pauseFrames / spanFrames,
    wordsPerMinute: null,
    speechSpanRatio: spanFrames / dbs.length,
  };
}

/**
 * Adds speaking pace once the words are known. Measured over the time spent
 * speaking, not the whole recording, so a long silence before starting does
 * not read as slow speech.
 */
export function withSpeakingRate(
  features: VoiceFeatures,
  wordCount: number,
  recordingMs: number,
): VoiceFeatures {
  const speakingMinutes = (recordingMs / 60_000) * features.speechSpanRatio;
  if (wordCount <= 0 || speakingMinutes <= 0) return features;
  return { ...features, wordsPerMinute: wordCount / speakingMinutes };
}

/**
 * Picks up to `count` windows spread evenly across a recording, as
 * [startSample, length] pairs. A ten-minute entry is measured from a
 * representative minute instead of all ten, keeping the cost flat.
 */
export function sampleWindows(
  totalSamples: number,
  windowSamples: number,
  count: number,
): [number, number][] {
  if (totalSamples <= windowSamples * count) return [[0, totalSamples]];
  const stride = (totalSamples - windowSamples) / (count - 1);
  return Array.from({ length: count }, (_, i) => [Math.round(i * stride), windowSamples]);
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}
