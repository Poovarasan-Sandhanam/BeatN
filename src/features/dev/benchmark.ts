import { Platform } from 'react-native';

export interface SpikeBenchmark {
  recordedAt: string;
  platform: string;
  osVersion: string;

  audioDurationMs: number;
  capturedSampleRate: number;
  capturedChannels: number;
  wavBytes: number;

  sttModelId: string;
  sttLoadMs: number;
  sttProcessingMs: number;
  /** processing time / audio duration. Below 1.0 is faster than real time. */
  sttRealTimeFactor: number;
  sttUsedGpu: boolean;
  sttReasonNoGpu: string;

  llmModelId: string;
  llmLoadMs: number;
  llmTimeToFirstTokenMs: number;
  llmTotalMs: number;
  llmPromptTokens: number;
  llmPredictedTokens: number;
  llmTokensPerSecond: number;
  llmUsedGpu: boolean;
  llmReasonNoGpu: string;
  llmStructuredAttempts: number;
  /** Whether the sampler was grammar-constrained (GBNF from the JSON Schema). */
  llmGrammarConstrained: boolean;
}

export function platformLabel(): { platform: string; osVersion: string } {
  return {
    platform: Platform.OS,
    osVersion: String(Platform.Version),
  };
}

/** Plain-text block, easy to copy out of the app and paste into BENCHMARKS.md. */
export function formatBenchmark(benchmark: SpikeBenchmark): string {
  const seconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

  return [
    `Recorded:        ${benchmark.recordedAt}`,
    `Platform:        ${benchmark.platform} ${benchmark.osVersion}`,
    '',
    `Audio:           ${seconds(benchmark.audioDurationMs)} @ ${benchmark.capturedSampleRate} Hz / ${benchmark.capturedChannels} ch`,
    `WAV size:        ${(benchmark.wavBytes / 1024 / 1024).toFixed(2)} MB`,
    '',
    `STT model:       ${benchmark.sttModelId}`,
    `STT load:        ${seconds(benchmark.sttLoadMs)}`,
    `STT processing:  ${seconds(benchmark.sttProcessingMs)}`,
    `STT RTF:         ${benchmark.sttRealTimeFactor.toFixed(2)}`,
    `STT GPU:         ${benchmark.sttUsedGpu ? 'yes' : `no (${benchmark.sttReasonNoGpu || 'unspecified'})`}`,
    '',
    `LLM model:       ${benchmark.llmModelId}`,
    `LLM load:        ${seconds(benchmark.llmLoadMs)}`,
    `LLM TTFT:        ${seconds(benchmark.llmTimeToFirstTokenMs)}`,
    `LLM total:       ${seconds(benchmark.llmTotalMs)}`,
    `LLM prompt tok:  ${benchmark.llmPromptTokens}`,
    `LLM output tok:  ${benchmark.llmPredictedTokens}`,
    `LLM tok/sec:     ${benchmark.llmTokensPerSecond.toFixed(1)}`,
    `LLM GPU:         ${benchmark.llmUsedGpu ? 'yes' : `no (${benchmark.llmReasonNoGpu || 'unspecified'})`}`,
    `JSON attempts:   ${benchmark.llmStructuredAttempts}`,
    `JSON grammar:    ${benchmark.llmGrammarConstrained ? 'yes (GBNF)' : 'no'}`,
  ].join('\n');
}
