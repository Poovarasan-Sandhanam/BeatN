import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { formatBenchmark } from '../../core/bench/types';
import { DEFAULT_BUNDLE_ID, getBundle } from '../../core/models/bundles';
import { formatBytes, formatDuration } from '../../shared/format';
import { useTheme } from '../../shared/theme';
import { Button, Card, ProgressBar, Screen, Text } from '../../shared/ui';
import { useBenchmarkRun } from './useBenchmarkRun';
import { useModelLibrary } from './useModelLibrary';

const bundle = getBundle(DEFAULT_BUNDLE_ID);

/**
 * Developer tools. Not reachable from normal navigation.
 *
 * This is where Phase 0 benchmarking lives: pick any speech/language pair,
 * record, and read the numbers that decide the model choice. It replaces
 * SpikeScreen, which was the whole app before there was an app.
 */
export default function DevScreen() {
  const theme = useTheme();
  const library = useModelLibrary();

  const [sttModelId, setSttModelId] = useState(bundle.sttModelId);
  const [llmModelId, setLlmModelId] = useState(bundle.llmModelId);
  const run = useBenchmarkRun(sttModelId, llmModelId);

  const isRecording = run.recorder.state === 'recording';
  const selectedInstalled =
    library.entries.find((e) => e.spec.id === sttModelId)?.installed &&
    library.entries.find((e) => e.spec.id === llmModelId)?.installed;

  return (
    <Screen>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="display">Developer</Text>
        <Text variant="caption" tone="muted">
          Benchmarking and model management. Not part of the product.
        </Text>
      </View>

      <Card title="Models">
        {library.entries.map((entry) => {
          const selected = entry.spec.id === sttModelId || entry.spec.id === llmModelId;
          const select = () =>
            entry.spec.kind === 'stt' ? setSttModelId(entry.spec.id) : setLlmModelId(entry.spec.id);

          return (
            <View key={entry.spec.id} style={[styles.modelRow, { borderColor: theme.colors.border }]}>
              <Pressable
                onPress={select}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={styles.modelInfo}>
                <Text variant="body">
                  {selected ? '◉' : '○'} {entry.spec.label}
                </Text>
                <Text variant="caption" tone="muted">
                  {formatBytes(entry.spec.approxBytes)} ·{' '}
                  {entry.installed ? 'downloaded' : 'not downloaded'}
                </Text>
                {entry.progress !== null && (
                  <ProgressBar
                    progress={entry.progress / 100}
                    label={`Downloading ${entry.spec.label}`}
                  />
                )}
              </Pressable>

              {entry.progress !== null ? (
                <Button
                  label={`${entry.progress.toFixed(0)}%`}
                  variant="ghost"
                  fullWidth={false}
                  onPress={() => library.cancel(entry.spec.id)}
                />
              ) : entry.installed ? (
                <Button
                  label="Delete"
                  variant="ghost"
                  fullWidth={false}
                  onPress={() => library.remove(entry.spec.id)}
                />
              ) : (
                <Button
                  label="Get"
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => void library.download(entry.spec.id)}
                />
              )}
            </View>
          );
        })}
        {library.errorText !== '' && (
          <Text variant="caption" tone="danger">
            {library.errorText}
          </Text>
        )}
      </Card>

      <Card title="Benchmark">
        <Text variant="caption" tone="muted">
          Record ~30 seconds of ordinary speech. Numbers from a simulator are your Mac&apos;s, not a
          phone&apos;s — never record those.
        </Text>

        <Button
          label={isRecording ? `Stop · ${formatDuration(run.recorder.durationMs)}` : 'Record'}
          variant={isRecording ? 'destructive' : 'primary'}
          disabled={run.busy || (!isRecording && !selectedInstalled)}
          loading={run.busy}
          onPress={run.toggle}
        />

        {!selectedInstalled && !isRecording && (
          <Text variant="caption" tone="muted">
            Download both selected models first.
          </Text>
        )}

        {run.busy && (
          <View style={styles.busyRow}>
            <ActivityIndicator size="small" color={theme.colors.accent} />
            <Text variant="caption" tone="muted">
              {run.phase === 'transcribing' ? 'Transcribing…' : 'Analysing…'}
            </Text>
          </View>
        )}
      </Card>

      {run.errorText !== '' && (
        <Card>
          <Text variant="body" tone="danger">
            {run.errorText}
          </Text>
        </Card>
      )}

      {run.benchmark && (
        <Card title="Results">
          {/* Selectable so the block can be long-pressed and copied straight
              into BENCHMARKS.md — no clipboard dependency needed. */}
          <Text variant="mono" selectable>
            {formatBenchmark(run.benchmark)}
          </Text>
          <Text variant="caption" tone="faint">
            Long-press to select and copy into BENCHMARKS.md.
          </Text>
        </Card>
      )}

      {run.transcript !== '' && (
        <Card title="Transcript">
          <Text variant="body">{run.transcript}</Text>
        </Card>
      )}

      {run.analysis && (
        <Card title="Reflection">
          <Text variant="body">{run.analysis.summary}</Text>
          <Text variant="caption" tone="muted">
            {run.analysis.mood} · {(run.analysis.moodConfidence * 100).toFixed(0)}% ·{' '}
            {run.analysis.topics.map((t) => t.name).join(', ') || 'no topics'}
          </Text>
        </Card>
      )}

      {run.rawJson !== '' && (
        <Card title="Raw model output">
          <Text variant="mono" tone="muted" selectable>
            {run.rawJson}
          </Text>
        </Card>
      )}

      {run.log.length > 0 && (
        <Card title="Event log">
          {run.log.map((line, index) => (
            <Text key={`${line}-${index}`} variant="mono" tone="muted">
              {line}
            </Text>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 12,
  },
  modelInfo: { flex: 1, gap: 2 },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
