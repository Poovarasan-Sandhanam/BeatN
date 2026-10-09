import { useCallback, useRef, useState } from 'react';

import { modelRuntime } from '../../core/ai/ModelRuntime';
import { useWavRecorder, type WavRecording } from '../../core/audio/useWavRecorder';
import { platformLabel, type SpikeBenchmark } from '../../core/bench/types';
import {
  buildAnalysisPrompt,
  entryAnalysisJsonSchema,
  validateEntryAnalysis,
  type EntryAnalysis,
} from '../../core/llm/analysis';
import { modelManager } from '../../core/models/ModelManager';
import { describeError } from '../../shared/errors';

export type BenchmarkPhase = 'idle' | 'recording' | 'transcribing' | 'analysing' | 'done' | 'error';

/**
 * Runs record → transcribe → analyse inline and reports timings.
 *
 * Deliberately bypasses the job queue. Step 1d has to benchmark *each model
 * combination*, which means choosing models explicitly and running them back
 * to back — the queue only ever uses the active bundle. This is a measuring
 * instrument, not the product path.
 */
export function useBenchmarkRun(sttModelId: string, llmModelId: string) {
  const recorder = useWavRecorder();

  const [phase, setPhase] = useState<BenchmarkPhase>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [transcript, setTranscript] = useState('');
  const [analysis, setAnalysis] = useState<EntryAnalysis | null>(null);
  const [rawJson, setRawJson] = useState('');
  const [benchmark, setBenchmark] = useState<SpikeBenchmark | null>(null);
  const [errorText, setErrorText] = useState('');

  const appendLog = useCallback((line: string) => {
    setLog((previous) => [...previous, line]);
  }, []);

  const modelsReady = useRef({ stt: sttModelId, llm: llmModelId });
  modelsReady.current = { stt: sttModelId, llm: llmModelId };

  const run = useCallback(
    async (recording: WavRecording) => {
      const stt = modelManager.installed(modelsReady.current.stt);
      const llm = modelManager.installed(modelsReady.current.llm);
      if (!stt || !llm) {
        setErrorText('Download both selected models first.');
        setPhase('error');
        return;
      }

      try {
        setPhase('transcribing');
        appendLog('TRANSCRIPTION_STARTED');
        const { transcription, sttStats } = await modelRuntime.useStt(
          { modelId: stt.spec.id, path: stt.path, approxBytes: stt.spec.approxBytes },
          async (engine) => {
            const result = await engine.transcribe(recording.uri, { language: 'en' });
            return {
              transcription: result,
              sttStats: {
                loadMs: engine.modelLoadTimeMs,
                usedGpu: engine.usingGpu,
                reasonNoGpu: engine.reasonNoGpu,
              },
            };
          },
          'interactive',
        );
        appendLog(`TRANSCRIPTION_COMPLETED ${transcription.processingTimeMs}ms`);
        setTranscript(transcription.text);

        setPhase('analysing');
        appendLog('ENTRY_PROCESSING_STARTED');
        const { structured, llmStats } = await modelRuntime.useLlm(
          { modelId: llm.spec.id, path: llm.path, approxBytes: llm.spec.approxBytes },
          async (engine) => {
            const result = await engine.generateStructured(
              buildAnalysisPrompt(transcription.text),
              entryAnalysisJsonSchema,
              validateEntryAnalysis,
              { maxTokens: 300 },
            );
            return {
              structured: result,
              llmStats: {
                loadMs: engine.modelLoadTimeMs,
                usedGpu: engine.usingGpu,
                reasonNoGpu: engine.reasonNoGpu,
              },
            };
          },
          'interactive',
        );
        appendLog(`ENTRY_PROCESSING_COMPLETED attempts=${structured.attempts}`);

        setAnalysis(structured.value);
        setRawJson(structured.raw);

        const { platform, osVersion } = platformLabel();
        const audioDurationMs = transcription.durationMs || recording.durationMs;

        setBenchmark({
          recordedAt: new Date().toISOString(),
          platform,
          osVersion,
          audioDurationMs,
          capturedSampleRate: recording.capturedSampleRate,
          capturedChannels: recording.capturedChannels,
          wavBytes: recording.byteLength,
          sttModelId: stt.spec.id,
          sttLoadMs: sttStats.loadMs,
          sttProcessingMs: transcription.processingTimeMs,
          sttRealTimeFactor:
            audioDurationMs > 0 ? transcription.processingTimeMs / audioDurationMs : 0,
          sttUsedGpu: sttStats.usedGpu,
          sttReasonNoGpu: sttStats.reasonNoGpu,
          llmModelId: llm.spec.id,
          llmLoadMs: llmStats.loadMs,
          llmTimeToFirstTokenMs: structured.metrics.timeToFirstTokenMs,
          llmTotalMs: structured.metrics.totalTimeMs,
          llmPromptTokens: structured.metrics.promptTokens,
          llmPredictedTokens: structured.metrics.predictedTokens,
          llmTokensPerSecond: structured.metrics.tokensPerSecond,
          llmUsedGpu: llmStats.usedGpu,
          llmReasonNoGpu: llmStats.reasonNoGpu,
          llmStructuredAttempts: structured.attempts,
          llmGrammarConstrained: structured.grammarConstrained,
        });

        setPhase('done');
      } catch (error) {
        setErrorText(describeError(error));
        setPhase('error');
      }
    },
    [appendLog],
  );

  const toggle = useCallback(async () => {
    if (recorder.state === 'recording') {
      try {
        const recording = await recorder.stop();
        appendLog(`RECORDING_SAVED ${recording.durationMs}ms`);
        await run(recording);
      } catch (error) {
        setErrorText(describeError(error));
        setPhase('error');
      }
      return;
    }

    setLog([]);
    setTranscript('');
    setAnalysis(null);
    setRawJson('');
    setBenchmark(null);
    setErrorText('');

    try {
      await recorder.start();
      setPhase('recording');
      appendLog('RECORDING_STARTED');
    } catch (error) {
      setErrorText(describeError(error));
      setPhase('error');
    }
  }, [appendLog, recorder, run]);

  return {
    recorder,
    phase,
    log,
    transcript,
    analysis,
    rawJson,
    benchmark,
    errorText,
    toggle,
    busy: phase === 'transcribing' || phase === 'analysing',
  };
}
