import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { getModelSpec } from '../../core/models/catalog';
import type { ModelBundle } from '../../core/models/bundles';
import { formatBytes } from '../../shared/format';
import { useTheme } from '../../shared/theme';
import { Button, Card, FadeIn, Glyph, ProgressBar, Screen, Text } from '../../shared/ui';
import { useBundleInstall } from './useBundleInstall';

export interface OnboardingScreenProps {
  bundle: ModelBundle;
  onReady: () => void;
}

const PROMISES = [
  { title: 'Just talk', body: 'Record a thought in seconds — no typing, no blank page.' },
  { title: 'Understood on this phone', body: 'Transcripts and reflections are written right here, offline.' },
  { title: 'Never uploaded', body: 'No account, no cloud. Your words don’t leave the device.' },
];

/**
 * First run. One decision, one button.
 *
 * The user is never shown "Whisper" or "Qwen", never picks a quantisation and
 * never learns that speech and language are two separate models. They are told
 * what the download is for, how big it is, and that nothing leaves the phone.
 */
export default function OnboardingScreen({ bundle, onReady }: OnboardingScreenProps) {
  const theme = useTheme();
  const { phase, progress, errorText, remainingBytes, start, cancel } = useBundleInstall(bundle);

  useEffect(() => {
    if (phase === 'done') onReady();
  }, [phase, onReady]);

  const installing = phase === 'installing';
  const percent = Math.round((progress?.overall ?? 0) * 100);

  // "Speech" and "Language" are the most honest words a user will understand.
  const currentLabel =
    progress?.currentModelId === undefined || progress?.currentModelId === null
      ? 'Preparing…'
      : getModelSpec(progress.currentModelId).kind === 'stt'
        ? 'Downloading speech model'
        : 'Downloading language model';

  return (
    <Screen>
      <View style={[styles.fill, { justifyContent: 'center', gap: theme.spacing.xxl }]}>
        <FadeIn style={{ gap: theme.spacing.lg }}>
          <View style={[styles.mark, { backgroundColor: theme.colors.accent }]}>
            <Glyph name="mic" color={theme.colors.onAccent} size={26} />
          </View>
          <Text variant="hero">Your thoughts,{'\n'}kept private.</Text>
          <Text variant="body" tone="muted">
            BeatN is a voice journal that works entirely offline. A one-time download sets up
            everything it needs.
          </Text>
        </FadeIn>

        <View style={{ gap: theme.spacing.lg }}>
          {PROMISES.map((promise, index) => (
            <FadeIn key={promise.title} delay={120 + index * 80} style={styles.promise}>
              <View style={[styles.promiseIndex, { backgroundColor: theme.colors.accentSoft }]}>
                <Text variant="captionStrong" tone="accent">
                  {index + 1}
                </Text>
              </View>
              <View style={[styles.fill, { gap: 2 }]}>
                <Text variant="bodyStrong">{promise.title}</Text>
                <Text variant="caption" tone="muted">
                  {promise.body}
                </Text>
              </View>
            </FadeIn>
          ))}
        </View>
      </View>

      <FadeIn delay={400} style={{ gap: theme.spacing.md }}>
        {installing && (
          <Card variant="flat">
            <View style={styles.progressHead}>
              <Text variant="caption" tone="muted">
                {currentLabel}
              </Text>
              <Text variant="numeric" style={{ fontSize: 22, lineHeight: 26 }}>
                {percent}%
              </Text>
            </View>
            <ProgressBar progress={progress?.overall ?? 0} label="Model download progress" height={6} />
            {progress !== null && (
              <Text variant="caption" tone="faint">
                {formatBytes(progress.bytesWritten)} of {formatBytes(progress.totalBytes)} · keep BeatN open
              </Text>
            )}
          </Card>
        )}

        {phase === 'error' && errorText !== '' && (
          <Card variant="flat" style={{ backgroundColor: theme.colors.dangerSoft, borderColor: 'transparent' }}>
            <Text variant="body" tone="danger">
              {errorText}
            </Text>
          </Card>
        )}

        {installing ? (
          <Button label="Cancel download" variant="ghost" onPress={cancel} />
        ) : (
          <>
            <Button
              label={phase === 'error' ? 'Try again' : `Download · ${formatBytes(remainingBytes)}`}
              size="large"
              onPress={start}
            />
            <Text variant="caption" tone="faint" align="center">
              Best over Wi-Fi. You only do this once.
            </Text>
          </>
        )}
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  mark: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  promise: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  promiseIndex: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
