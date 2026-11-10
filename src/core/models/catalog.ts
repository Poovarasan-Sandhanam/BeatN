export type ModelKind = 'stt' | 'llm';

/** Rough device tiers, used to pick a default model per device. */
export type DeviceClass = 'low' | 'mid' | 'high';

export interface ModelSpec {
  id: string;
  kind: ModelKind;
  label: string;
  /** Direct download URL. Models are fetched after install, never bundled. */
  url: string;
  /** Download size, for the UI and for storage checks. Exact — see `bytes`. */
  approxBytes: number;
  /** Exact file size. A file of any other size is incomplete or wrong. */
  bytes: number;
  /**
   * Published SHA-256 (Hugging Face's LFS object id). The source of truth that
   * `md5` was derived from; kept so the pair can be re-verified.
   */
  sha256: string;
  /**
   * MD5 of the same file, checked on device after every download. MD5 because
   * the OS hashes it natively in seconds; it guards against corruption, while
   * HTTPS guards the transport.
   */
  md5: string;
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
    approxBytes: 32_166_155,
    bytes: 32_166_155,
    sha256: 'c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b',
    md5: '42e56b612f0797e41c887536792c98b5',
    minDeviceClass: 'low',
    notes: 'Fastest. Expected fallback for low-memory Android.',
  },
  {
    id: 'whisper-base-en-q5_1',
    kind: 'stt',
    label: 'Whisper Base (English, Q5_1)',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin',
    approxBytes: 59_721_011,
    bytes: 59_721_011,
    sha256: '4baf70dd0d7c4247ba2b81fafd9c01005ac77c2f9ef064e00dcf195d0e2fdd2f',
    md5: '55309cc6613788f07ac7988985210734',
    minDeviceClass: 'mid',
    notes: 'Default candidate: noticeably better punctuation than tiny.',
  },
  {
    id: 'whisper-small-en-q5_1',
    kind: 'stt',
    label: 'Whisper Small (English, Q5_1)',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en-q5_1.bin',
    approxBytes: 190_098_681,
    bytes: 190_098_681,
    sha256: 'bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30',
    md5: '47746cb8fbe71c7fcb0d158e71ec9545',
    minDeviceClass: 'high',
    notes: 'Only worth it if the real-time factor stays well under 1.0.',
  },
  {
    id: 'qwen2.5-0.5b-instruct-q4_k_m',
    kind: 'llm',
    label: 'Qwen2.5 0.5B Instruct (Q4_K_M)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    approxBytes: 491_400_032,
    bytes: 491_400_032,
    sha256: '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db',
    md5: 'a24e22d4ea0d9a6b3efd57936ecb127b',
    minDeviceClass: 'low',
    notes: 'Fast, but structured-JSON reliability is the open question.',
  },
  {
    id: 'qwen2.5-1.5b-instruct-q4_k_m',
    kind: 'llm',
    label: 'Qwen2.5 1.5B Instruct (Q4_K_M)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    approxBytes: 1_117_320_736,
    bytes: 1_117_320_736,
    sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
    md5: '8e5111fdbc5c150920d368ff802c4b5a',
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
