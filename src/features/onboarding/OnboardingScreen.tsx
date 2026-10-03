import { useEffect } from 'react';
import { View } from 'react-native';

import { getModelSpec } from '../../core/models/catalog';
import type { ModelBundle } from '../../core/models/bundles';
import { formatBytes } from '../../shared/format';
import { useTheme } from '../../shared/theme';
import { Button, Card, ProgressBar, Screen, Text } from '../../shared/ui';
import { useBundleInstall } from './useBundleInstall';

export interface OnboardingScreenProps {
  bundle: ModelBundle;
  onReady: () => void;
}

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
    <Screen centred>
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="display">BeatN works offline.</Text>
        <Text variant="body" tone="muted">
          Your voice, your words and your reflections stay on this phone. To make that possible,
          BeatN needs to download its speech and language models once.
        </Text>
      </View>

      <Card>
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="bodyStrong">{bundle.label} · {formatBytes(remainingBytes)}</Text>
          <Text variant="caption" tone="muted">
            {bundle.description}
          </Text>
        </View>

        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="caption" tone="muted">
            • Best downloaded over Wi-Fi.
          </Text>
          <Text variant="caption" tone="muted">
            • Nothing you record is ever uploaded.
          </Text>
          <Text variant="caption" tone="muted">
            • You only need to do this once.
          </Text>
        </View>
      </Card>

      {installing && (
        <Card>
          <View style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="caption" tone="muted">
                {currentLabel}
              </Text>
              <Text variant="caption" tone="muted">
                {percent}%
              </Text>
            </View>
            <ProgressBar progress={progress?.overall ?? 0} label="Model download progress" />
            {progress !== null && (
              <Text variant="caption" tone="faint">
                {formatBytes(progress.bytesWritten)} of {formatBytes(progress.totalBytes)}
              </Text>
            )}
          </View>
        </Card>
      )}

      {phase === 'error' && errorText !== '' && (
        <Card>
          <Text variant="body" tone="danger">
            {errorText}
          </Text>
        </Card>
      )}

      <View style={{ gap: theme.spacing.sm }}>
        <Button
          label={phase === 'error' ? 'Try again' : installing ? 'Downloading…' : 'Download'}
          caption={installing ? undefined : formatBytes(remainingBytes)}
          size="large"
          loading={installing}
          onPress={start}
        />
        {installing && <Button label="Cancel" variant="ghost" onPress={cancel} />}
      </View>
    </Screen>
  );
}
