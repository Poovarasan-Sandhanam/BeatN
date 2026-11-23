/**
 * Making recordings loud enough to hear.
 *
 * The PCM stream is the microphone's raw signal: iOS applies no automatic gain
 * to it, so speech lands around -50 dBFS — barely audible on playback, near
 * the noise floor for transcription, and below what voice analysis treats as
 * voice. Each recording is therefore normalised once, when it is saved.
 *
 * Normalised to a high percentile rather than the single loudest sample, so
 * one tap on the phone or a plosive "p" cannot hold the whole recording down.
 * The few samples above the target are soft-limited, not clipped.
 */

const FULL_SCALE = 32768;
const BINS = 1024;
const BIN_WIDTH = FULL_SCALE / BINS;

/** Loud moments land here after normalising: -3 dBFS. */
const TARGET_PEAK = 0.708;
/** The sample level the gain is computed from. 99.9 % of samples sit below it. */
const PEAK_PERCENTILE = 0.999;
/** At most +30 dB: more than this would turn a silent room into hiss. */
const MAX_GAIN = 31.6;
/** Below this, the change is inaudible and not worth rewriting the file for. */
export const MIN_USEFUL_GAIN = 1.12; // +1 dB
/** Soft limiting starts here, so nothing hits the hard ceiling abruptly. */
const KNEE = 0.89;

/** Running distribution of sample magnitudes. Constant memory, any duration. */
export class LevelHistogram {
  readonly bins = new Float64Array(BINS);
  count = 0;

  add(samples: Int16Array): void {
    for (let i = 0; i < samples.length; i += 1) {
      const magnitude = Math.abs(samples[i]);
      this.bins[Math.min(BINS - 1, Math.floor(magnitude / BIN_WIDTH))] += 1;
    }
    this.count += samples.length;
  }

  /** Sample magnitude (0..1) below which a fraction `p` of samples fall. */
  percentile(p: number): number {
    if (this.count === 0) return 0;
    const wanted = p * this.count;
    let seen = 0;
    for (let bin = 0; bin < BINS; bin += 1) {
      seen += this.bins[bin];
      if (seen >= wanted) return ((bin + 1) * BIN_WIDTH) / FULL_SCALE;
    }
    return 1;
  }
}

/** How much to boost a recording. 1 when it is already loud, or silent. */
export function normalisationGain(histogram: LevelHistogram): number {
  const reference = histogram.percentile(PEAK_PERCENTILE);
  // Everything in the lowest bin (below about -60 dBFS): silence, not quiet
  // speech. Boosting it would only raise the noise floor.
  if (reference <= BIN_WIDTH / FULL_SCALE) return 1;
  return Math.max(1, Math.min(MAX_GAIN, TARGET_PEAK / reference));
}

/**
 * Smoothly bends values above the knee towards full scale instead of
 * flattening them, so a loud laugh after a big boost stays clean.
 */
export function softLimit(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude <= KNEE) return value;
  const headroom = 1 - KNEE;
  const limited = KNEE + headroom * Math.tanh((magnitude - KNEE) / headroom);
  return Math.sign(value) * limited;
}

/** Boosts samples in place. */
export function applyGain(samples: Int16Array, gain: number): void {
  for (let i = 0; i < samples.length; i += 1) {
    const boosted = softLimit((samples[i] / FULL_SCALE) * gain);
    samples[i] = Math.max(-32768, Math.min(32767, Math.round(boosted * FULL_SCALE)));
  }
}

/**
 * A level for meters and waveforms, 0..1, on a decibel scale: quiet speech
 * still moves the bars, and a shout does not just pin them. -60 dBFS and
 * below reads as 0.
 */
export function meterLevel(peak: number): number {
  if (peak <= 0) return 0;
  const db = 20 * Math.log10(peak);
  return Math.max(0, Math.min(1, (db + 60) / 60));
}
