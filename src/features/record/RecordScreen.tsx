import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useWavRecorder } from '../../core/audio/useWavRecorder';
import { useServices } from '../../services/ServiceProvider';
import { describeError, isPermissionError } from '../../shared/errors';
import { formatDuration } from '../../shared/format';
import { useTheme } from '../../shared/theme';
import { Button, Card, Screen, Text } from '../../shared/ui';
import { Linking } from 'react-native';

export default function RecordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const services = useServices();
  const recorder = useWavRecorder();

  const [errorText, setErrorText] = useState('');
  const [needsSettings, setNeedsSettings] = useState(false);
  const [saving, setSaving] = useState(false);

  const isRecording = recorder.state === 'recording';

  const report = useCallback((error: unknown) => {
    setErrorText(describeError(error));
    setNeedsSettings(isPermissionError(error));
  }, []);

  const start = useCallback(async () => {
    setErrorText('');
    setNeedsSettings(false);
    try {
      await recorder.start();
    } catch (error) {
      report(error);
    }
  }, [recorder, report]);

  /**
   * Save and leave. No AI runs here: the entry row and its job are written,
   * then we navigate straight back. The user never watches a spinner for
   * something that takes tens of seconds.
   */
  const stop = useCallback(async () => {
    if (!services) return;
    setSaving(true);
    try {
      const recording = await recorder.stop();
      await services.journal.createEntryFromRecording(recording);
      router.back();
    } catch (error) {
      report(error);
    } finally {
      setSaving(false);
    }
  }, [recorder, router, services, report]);

  const cancel = useCallback(() => {
    recorder.cancel();
    router.back();
  }, [recorder, router]);

  return (
    <Screen centred scroll={false}>
      <View style={styles.meter}>
        <Text variant="display" align="center">
          {formatDuration(recorder.durationMs)}
        </Text>
        <Text variant="caption" tone="muted" align="center">
          {isRecording ? 'Listening — everything stays on this phone' : 'Ready when you are'}
        </Text>
      </View>

      <View
        style={[
          styles.levelTrack,
          { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radius.pill },
        ]}
        accessibilityElementsHidden>
        <View
          style={{
            width: `${Math.round(recorder.level * 100)}%`,
            height: '100%',
            borderRadius: theme.radius.pill,
            backgroundColor: isRecording ? theme.colors.recording : theme.colors.border,
          }}
        />
      </View>

      {errorText !== '' && (
        <Card>
          <Text variant="body" tone="danger">
            {errorText}
          </Text>
          {needsSettings && (
            <Button label="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} />
          )}
        </Card>
      )}

      <View style={{ gap: theme.spacing.sm }}>
        {isRecording ? (
          <Button
            label={saving ? 'Saving…' : 'Stop'}
            size="hero"
            variant="destructive"
            loading={saving}
            onPress={stop}
          />
        ) : (
          <Button label="Record" size="hero" onPress={start} disabled={saving} />
        )}

        <Button
          label="Cancel"
          variant="ghost"
          onPress={cancel}
          disabled={saving}
          accessibilityHint={isRecording ? 'Discards this recording' : undefined}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meter: { gap: 4 },
  levelTrack: { height: 10, overflow: 'hidden' },
});
