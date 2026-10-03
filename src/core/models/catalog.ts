export type ModelKind = 'stt' | 'llm';

/** Rough device tiers, used to pick a default model per device. */
export type DeviceClass = 'low' | 'mid' | 'high';

export interface ModelSpec {
  id: string;
  kind: ModelKind;
  label: string;
  /** Direct download URL. Models are fetched after install, never bundled. */
  url: string;
  /** Approximate download size, for the UI and for storage checks. */
  approxBytes: number;
  /** Lowest device class this model is reasonable on. */
  minDeviceClass: DeviceClass;
  notes: string;
}

/**
 * Phase 0 candidates. The point of the spike is to measure these on real
 * hardware and drop whichever ones are too slow before the app is built
 * around them.
 */
export const MODEL_CATALOG: ModelSpec[] = [
  {
    id: 'whisper-tiny-en-q5_1',
    kind: 'stt',
    label: 'Whisper Tiny (English, Q5_1)',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en-q5_1.bin',
    approxBytes: 32_200_000,
    minDeviceClass: 'low',
    notes: 'Fastest. Expected fallback for low-memory Android.',
  },
  {
    id: 'whisper-base-en-q5_1',
    kind: 'stt',
    label: 'Whisper Base (English, Q5_1)',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin',
    approxBytes: 59_700_000,
    minDeviceClass: 'mid',
    notes: 'Default candidate: noticeably better punctuation than tiny.',
  },
  {
    id: 'whisper-small-en-q5_1',
    kind: 'stt',
    label: 'Whisper Small (English, Q5_1)',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en-q5_1.bin',
    approxBytes: 190_000_000,
    minDeviceClass: 'high',
    notes: 'Only worth it if the real-time factor stays well under 1.0.',
  },
  {
    id: 'qwen2.5-0.5b-instruct-q4_k_m',
    kind: 'llm',
    label: 'Qwen2.5 0.5B Instruct (Q4_K_M)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    approxBytes: 398_000_000,
    minDeviceClass: 'low',
    notes: 'Fast, but structured-JSON reliability is the open question.',
  },
  {
    id: 'qwen2.5-1.5b-instruct-q4_k_m',
    kind: 'llm',
    label: 'Qwen2.5 1.5B Instruct (Q4_K_M)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    approxBytes: 1_120_000_000,
    minDeviceClass: 'mid',
    notes: 'Default candidate for summary / mood / topics.',
  },
];

export function getModelSpec(id: string): ModelSpec {
  const spec = MODEL_CATALOG.find((model) => model.id === id);
  if (!spec) throw new Error(`UNKNOWN_MODEL:${id}`);
  return spec;
}

export function modelsOfKind(kind: ModelKind): ModelSpec[] {
  return MODEL_CATALOG.filter((model) => model.kind === kind);
}
