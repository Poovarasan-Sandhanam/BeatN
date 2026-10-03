import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import { useWavRecorder, type WavRecording } from '../core/audio/useWavRecorder';
import { modelRuntime } from '../core/ai/ModelRuntime';
import { buildAnalysisPrompt, validateEntryAnalysis, type EntryAnalysis } from '../core/llm/analysis';
import { modelManager } from '../core/models/ModelManager';
import { modelsOfKind } from '../core/models/catalog';
import { formatBenchmark, platformLabel, type SpikeBenchmark } from '../core/bench/types';
import { describeError, isPermissionError } from '../shared/errors';

type Phase = 'idle' | 'recording' | 'transcribing' | 'analysing' | 'done' | 'error';

interface ModelDownloadState {
  percent: number;
  active: boolean;
}

const DEFAULT_STT_MODEL = 'whisper-base-en-q5_1';
const DEFAULT_LLM_MODEL = 'qwen2.5-1.5b-instruct-q4_k_m';

export default function SpikeScreen() {
  const isDark = useColorScheme() === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  const recorder = useWavRecorder();

  const [sttModelId, setSttModelId] = useState(DEFAULT_STT_MODEL);
  const [llmModelId, setLlmModelId] = useState(DEFAULT_LLM_MODEL);
  const [downloads, setDownloads] = useState<Record<string, ModelDownloadState>>({});
  const [installedTick, setInstalledTick] = useState(0);

  const [phase, setPhase] = useState<Phase>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [transcript, setTranscript] = useState('');
  const [analysis, setAnalysis] = useState<EntryAnalysis | null>(null);
  const [rawJson, setRawJson] = useState('');
  const [benchmark, setBenchmark] = useState<SpikeBenchmark | null>(null);
  const [errorText, setErrorText] = useState('');
  // A denied microphone cannot be fixed in-app; offer a route to Settings.
  const [errorNeedsSettings, setErrorNeedsSettings] = useState(false);

  // Model lifetime belongs to ModelRuntime, not to this screen: it keeps
  // weights loaded across runs but evicts them when the app backgrounds.

  const appendLog = useCallback((line: string) => {
    setLog((previous) => [...previous, line]);
  }, []);

  const reportError = useCallback((error: unknown) => {
    setErrorText(describeError(error));
    setErrorNeedsSettings(isPermissionError(error));
  }, []);

  const sttModels = useMemo(() => modelsOfKind('stt'), []);
  const llmModels = useMemo(() => modelsOfKind('llm'), []);

  const isInstalled = useCallback(
    (id: string) => {
      void installedTick; // re-evaluate after a download completes
      return modelManager.isInstalled(id);
    },
    [installedTick],
  );

  const handleDownload = useCallback(
    async (modelId: string) => {
      setDownloads((previous) => ({ ...previous, [modelId]: { percent: 0, active: true } }));
      try {
        await modelManager.download(modelId, ({ percent }) => {
          setDownloads((previous) => ({ ...previous, [modelId]: { percent, active: true } }));
        });
        setInstalledTick((tick) => tick + 1);
      } catch (error) {
        reportError(error);
        setPhase('error');
      } finally {
        setDownloads((previous) => ({ ...previous, [modelId]: { percent: 100, active: false } }));
      }
    },
    [reportError],
  );

  const runPipeline = useCallback(
    async (recording: WavRecording) => {
      const sttModel = modelManager.installed(sttModelId);
      const llmModel = modelManager.installed(llmModelId);
      if (!sttModel || !llmModel) {
        setErrorText('Download both models before running the spike.');
        setPhase('error');
        return;
      }

      try {
        setPhase('transcribing');
        appendLog('TRANSCRIPTION_STARTED');
        const { transcription, sttStats } = await modelRuntime.useStt(
          { modelId: sttModelId, path: sttModel.path, approxBytes: sttModel.spec.approxBytes },
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
        );
        appendLog(`TRANSCRIPTION_COMPLETED ${transcription.processingTimeMs}ms`);
        setTranscript(transcription.text);

        setPhase('analysing');
        appendLog('ENTRY_PROCESSING_STARTED');
        const { structured, llmStats } = await modelRuntime.useLlm(
          { modelId: llmModelId, path: llmModel.path, approxBytes: llmModel.spec.approxBytes },
          async (engine) => {
            const result = await engine.generateStructured(
              buildAnalysisPrompt(transcription.text),
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
          sttModelId,
          sttLoadMs: sttStats.loadMs,
          sttProcessingMs: transcription.processingTimeMs,
          sttRealTimeFactor:
            audioDurationMs > 0 ? transcription.processingTimeMs / audioDurationMs : 0,
          sttUsedGpu: sttStats.usedGpu,
          sttReasonNoGpu: sttStats.reasonNoGpu,
          llmModelId,
          llmLoadMs: llmStats.loadMs,
          llmTimeToFirstTokenMs: structured.metrics.timeToFirstTokenMs,
          llmTotalMs: structured.metrics.totalTimeMs,
          llmPromptTokens: structured.metrics.promptTokens,
          llmPredictedTokens: structured.metrics.predictedTokens,
          llmTokensPerSecond: structured.metrics.tokensPerSecond,
          llmUsedGpu: llmStats.usedGpu,
          llmReasonNoGpu: llmStats.reasonNoGpu,
          llmStructuredAttempts: structured.attempts,
        });

        setPhase('done');
      } catch (error) {
        reportError(error);
        setPhase('error');
      }
    },
    [appendLog, llmModelId, reportError, sttModelId],
  );

  const handleRecordPress = useCallback(async () => {
    if (recorder.state === 'recording') {
      try {
        const recording = await recorder.stop();
        appendLog(`RECORDING_SAVED ${recording.durationMs}ms`);
        await runPipeline(recording);
      } catch (error) {
        reportError(error);
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
    setErrorNeedsSettings(false);

    try {
      await recorder.start();
      setPhase('recording');
      appendLog('RECORDING_STARTED');
    } catch (error) {
      reportError(error);
      setPhase('error');
    }
  }, [appendLog, recorder, reportError, runPipeline]);

  const busy = phase === 'transcribing' || phase === 'analysing';
  const isRecording = recorder.state === 'recording';
  const seconds = (recorder.durationMs / 1000).toFixed(1);

  // Both models must be on disk BEFORE recording starts. Checking after Stop
  // meant the user could speak for two minutes and then be told to download
  // 1.2 GB, with the recording unrecoverable from the UI.
  const missingModels = [sttModelId, llmModelId].filter((id) => !isInstalled(id));
  const modelsReady = missingModels.length === 0;
  // Never disable the button mid-recording — that would strand the audio.
  const recordDisabled = busy || (!isRecording && !modelsReady);

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: theme.text }]}>BeatN — Phase 0 spike</Text>
      <Text style={[styles.subtitle, { color: theme.muted }]}>
        Record → Whisper → local LLM → validated JSON
      </Text>

      <Section title="1 · Models" theme={theme}>
        {[...sttModels, ...llmModels].map((model) => {
          const download = downloads[model.id];
          const installed = isInstalled(model.id);
          const selected = model.id === sttModelId || model.id === llmModelId;

          return (
            <View key={model.id} style={[styles.modelRow, { borderColor: theme.border }]}>
              <Pressable
                onPress={() =>
                  model.kind === 'stt' ? setSttModelId(model.id) : setLlmModelId(model.id)
                }
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={styles.modelInfo}>
                <Text style={[styles.modelLabel, { color: theme.text }]}>
                  {selected ? '◉' : '○'} {model.label}
                </Text>
                <Text style={[styles.modelMeta, { color: theme.muted }]}>
                  {(model.approxBytes / 1024 / 1024).toFixed(0)} MB ·{' '}
                  {installed ? 'downloaded' : 'not downloaded'}
                </Text>
              </Pressable>

              {!installed && (
                <Pressable
                  onPress={() => handleDownload(model.id)}
                  disabled={download?.active}
                  accessibilityRole="button"
                  accessibilityLabel={`Download ${model.label}`}
                  style={[styles.smallButton, { backgroundColor: theme.accent }]}>
                  <Text style={styles.smallButtonText}>
                    {download?.active ? `${download.percent.toFixed(0)}%` : 'Get'}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </Section>

      <Section title="2 · Record" theme={theme}>
        <Pressable
          onPress={handleRecordPress}
          disabled={recordDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: recordDisabled }}
          accessibilityLabel={
            isRecording ? 'Stop voice journal recording' : 'Start voice journal recording'
          }
          accessibilityHint={
            !isRecording && !modelsReady
              ? 'Unavailable until both models have been downloaded'
              : undefined
          }
          style={[
            styles.recordButton,
            {
              backgroundColor: isRecording ? theme.danger : theme.accent,
              opacity: recordDisabled ? 0.5 : 1,
            },
          ]}>
          <Text style={styles.recordButtonText}>
            {isRecording ? `Stop · ${seconds}s` : 'Record'}
          </Text>
        </Pressable>

        {!isRecording && !modelsReady && (
          <Text style={[styles.modelMeta, { color: theme.muted }]}>
            Download {missingModels.length === 2 ? 'both models' : 'the remaining model'} above
            before recording.
          </Text>
        )}

        {recorder.state === 'recording' && (
          <View style={styles.levelTrack} accessibilityElementsHidden>
            <View
              style={[
                styles.levelFill,
                { width: `${Math.round(recorder.level * 100)}%`, backgroundColor: theme.accent },
              ]}
            />
          </View>
        )}

        {busy && (
          <View style={styles.busyRow}>
            <ActivityIndicator color={theme.accent} />
            <Text style={[styles.busyText, { color: theme.muted }]}>
              {phase === 'transcribing' ? 'Transcribing…' : 'Creating your reflection…'}
            </Text>
          </View>
        )}
      </Section>

      {errorText !== '' && (
        <Section title="Error" theme={theme}>
          <Text style={[styles.mono, { color: theme.danger }]}>{errorText}</Text>
          {errorNeedsSettings && (
            <Pressable
              onPress={() => Linking.openSettings()}
              accessibilityRole="button"
              accessibilityLabel="Open BeatN settings to enable the microphone"
              style={[styles.smallButton, { backgroundColor: theme.accent, alignSelf: 'flex-start' }]}>
              <Text style={styles.smallButtonText}>Open Settings</Text>
            </Pressable>
          )}
        </Section>
      )}

      {transcript !== '' && (
        <Section title="3 · Transcript" theme={theme}>
          <Text style={[styles.body, { color: theme.text }]}>{transcript}</Text>
        </Section>
      )}

      {analysis && (
        <Section title="4 · Reflection (AI generated)" theme={theme}>
          <Text style={[styles.body, { color: theme.text }]}>{analysis.summary}</Text>
          <Text style={[styles.modelMeta, { color: theme.muted }]}>
            Mood: {analysis.mood} ({(analysis.moodConfidence * 100).toFixed(0)}%)
          </Text>
          <Text style={[styles.modelMeta, { color: theme.muted }]}>
            Topics: {analysis.topics.map((topic) => topic.name).join(', ') || '—'}
          </Text>
        </Section>
      )}

      {benchmark && (
        <Section title="5 · Benchmark" theme={theme}>
          <Text style={[styles.mono, { color: theme.text }]}>{formatBenchmark(benchmark)}</Text>
        </Section>
      )}

      {rawJson !== '' && (
        <Section title="Raw model output" theme={theme}>
          <Text style={[styles.mono, { color: theme.muted }]}>{rawJson}</Text>
        </Section>
      )}

      {log.length > 0 && (
        <Section title="Event log" theme={theme}>
          {log.map((line, index) => (
            <Text key={`${line}-${index}`} style={[styles.mono, { color: theme.muted }]}>
              {line}
            </Text>
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

function Section({
  title,
  theme,
  children,
}: {
  title: string;
  theme: Theme;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.sectionTitle, { color: theme.muted }]}>{title}</Text>
      {children}
    </View>
  );
}

interface Theme {
  background: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  danger: string;
}

const lightTheme: Theme = {
  background: '#F6F5F2',
  surface: '#FFFFFF',
  border: '#E5E3DE',
  text: '#16150F',
  muted: '#6C6A63',
  accent: '#3A5BD9',
  danger: '#C0392B',
};

const darkTheme: Theme = {
  background: '#101014',
  surface: '#1A1A20',
  border: '#2A2A33',
  text: '#F2F1EE',
  muted: '#9A988F',
  accent: '#7B93F5',
  danger: '#E8705F',
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingTop: 72, paddingBottom: 64, gap: 16 },
  title: { fontSize: 24, fontWeight: '600' },
  subtitle: { fontSize: 14, marginTop: -8 },
  section: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 12,
  },
  modelInfo: { flex: 1, gap: 2 },
  modelLabel: { fontSize: 15 },
  modelMeta: { fontSize: 12 },
  smallButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, minWidth: 64 },
  smallButtonText: { color: '#FFFFFF', fontWeight: '600', textAlign: 'center' },
  recordButton: { paddingVertical: 18, borderRadius: 14, alignItems: 'center' },
  recordButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  levelTrack: { height: 6, borderRadius: 3, backgroundColor: '#00000018', overflow: 'hidden' },
  levelFill: { height: 6, borderRadius: 3 },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  busyText: { fontSize: 14 },
  body: { fontSize: 15, lineHeight: 22 },
  mono: { fontFamily: 'Courier', fontSize: 12, lineHeight: 17 },
});
