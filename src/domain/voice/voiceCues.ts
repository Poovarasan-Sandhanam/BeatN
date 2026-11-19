/**
 * Turns voice measurements into plain-language cues, judged against the
 * speaker's own usual voice.
 *
 * Voices differ far more between people than within one person: a naturally
 * quiet speaker is not "low", but quieter than *their* usual is a signal. So
 * once there are a few earlier entries, every trait is scored against the
 * person's own median and spread. Before that, only traits with stable
 * population norms (pace, pitch movement, pauses) are used — loudness depends
 * on how far the phone is from the mouth and means nothing without a baseline.
 */
import { percentile, type VoiceFeatures } from './voiceFeatures';

export type Trait = 'loudness' | 'pitchVariation' | 'pace' | 'pauses';
export type Energy = 'low' | 'typical' | 'high';

export interface VoiceCue {
  trait: Trait;
  direction: 'higher' | 'lower';
  /** Standard scores from the baseline; |z| ≥ 1 to be reported at all. */
  z: number;
  /** "slower than usual" — for the prompt and the screen. */
  label: string;
}

export interface VoiceReading {
  cues: VoiceCue[];
  /** Overall arousal read from the voice. */
  energy: Energy;
  /** True when judged against this person's own entries. */
  personal: boolean;
}

/** Earlier entries needed before the person's own voice becomes the yardstick. */
export const BASELINE_MIN_ENTRIES = 3;
const CUE_THRESHOLD = 1;
const ENERGY_THRESHOLD = 0.75;

/**
 * Typical conversational speech, used until a personal baseline exists.
 * Deliberately wide spreads: a stranger's norm should only flag the extreme.
 */
const POPULATION: Partial<Record<Trait, { centre: number; spread: number }>> = {
  pace: { centre: 150, spread: 35 },
  pitchVariation: { centre: 3.5, spread: 1.5 },
  pauses: { centre: 0.2, spread: 0.12 },
};

/** Smallest spreads a personal baseline may use, so near-identical entries do not turn noise into cues. */
const MIN_SPREAD: Record<Trait, number> = {
  loudness: 2,
  pitchVariation: 0.6,
  pace: 12,
  pauses: 0.05,
};

const LABELS: Record<Trait, { higher: string; lower: string }> = {
  loudness: { higher: 'louder', lower: 'quieter' },
  pitchVariation: { higher: 'more animated', lower: 'flatter, more monotone' },
  pace: { higher: 'faster', lower: 'slower' },
  pauses: { higher: 'more hesitant, with longer pauses', lower: 'more fluent, with fewer pauses' },
};

function traitValue(features: VoiceFeatures, trait: Trait): number | null {
  switch (trait) {
    case 'loudness':
      return features.loudnessDb;
    case 'pitchVariation':
      return features.pitchVariationSemitones;
    case 'pace':
      return features.wordsPerMinute;
    case 'pauses':
      return features.pauseRatio;
  }
}

function baselineFor(
  trait: Trait,
  history: readonly VoiceFeatures[],
): { centre: number; spread: number } | null {
  const values = history
    .map((features) => traitValue(features, trait))
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((a, b) => a - b);

  if (values.length >= BASELINE_MIN_ENTRIES) {
    const centre = percentile(values, 0.5);
    // Median absolute deviation, scaled to match a standard deviation. Robust
    // to the one entry recorded on a bus.
    const deviations = values.map((value) => Math.abs(value - centre)).sort((a, b) => a - b);
    const spread = Math.max(percentile(deviations, 0.5) * 1.4826, MIN_SPREAD[trait]);
    return { centre, spread };
  }
  return POPULATION[trait] ?? null;
}

const TRAITS: Trait[] = ['loudness', 'pitchVariation', 'pace', 'pauses'];

export function describeVoice(
  features: VoiceFeatures,
  history: readonly VoiceFeatures[],
): VoiceReading {
  const usable = history.filter((entry) => entry.version === features.version);
  const personal = usable.length >= BASELINE_MIN_ENTRIES;

  const scores: Partial<Record<Trait, number>> = {};
  const cues: VoiceCue[] = [];
  for (const trait of TRAITS) {
    const value = traitValue(features, trait);
    const baseline = baselineFor(trait, usable);
    if (value === null || !Number.isFinite(value) || baseline === null) continue;

    const z = (value - baseline.centre) / baseline.spread;
    scores[trait] = z;
    if (Math.abs(z) >= CUE_THRESHOLD) {
      const direction = z > 0 ? 'higher' : 'lower';
      cues.push({
        trait,
        direction,
        z,
        label: `${LABELS[trait][direction]} than ${personal ? 'usual' : 'typical'}`,
      });
    }
  }

  // Arousal rises with loudness, pitch movement and pace, and falls with
  // pauses. Averaged over whatever could be measured.
  const signals = [scores.loudness, scores.pitchVariation, scores.pace, negate(scores.pauses)].filter(
    (value): value is number => value !== undefined,
  );
  const arousal = signals.length > 0 ? signals.reduce((a, b) => a + b, 0) / signals.length : 0;
  const energy: Energy =
    arousal >= ENERGY_THRESHOLD ? 'high' : arousal <= -ENERGY_THRESHOLD ? 'low' : 'typical';

  // Strongest first: the prompt and the screen both lead with what stood out most.
  cues.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return { cues, energy, personal };
}

function negate(value: number | undefined): number | undefined {
  return value === undefined ? undefined : -value;
}

/** One line for the language model. Never includes raw numbers it might parrot. */
export function voiceSummaryForPrompt(reading: VoiceReading): string {
  const baseline = reading.personal ? "compared with this person's usual voice" : 'compared with typical speech';
  const cues = reading.cues.length > 0 ? reading.cues.map((cue) => cue.label).join('; ') : 'nothing unusual';
  return `${cues} (${baseline}). Overall vocal energy: ${reading.energy}.`;
}
