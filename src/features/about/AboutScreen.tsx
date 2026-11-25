import * as Application from 'expo-application';
import { useRouter } from 'expo-router';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LINKS, supportMailto } from '../../shared/links';
import { useTheme } from '../../shared/theme';
import { Card, FadeIn, Glyph, IconButton, PressableScale, Text } from '../../shared/ui';

/**
 * About: the privacy policy and support, reachable from inside the app as
 * App Review guideline 5.1.1 requires, plus the version and the open-source
 * work BeatN runs on.
 */
export default function AboutScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const version = Application.nativeApplicationVersion ?? '1.0.0';
  const build = Application.nativeBuildVersion;
  const versionLabel = build ? `${version} (${build})` : version;

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + theme.spacing.sm, paddingHorizontal: theme.spacing.lg }]}>
        <IconButton icon="back" accessibilityLabel="Back" onPress={() => router.back()} />
        <Text variant="heading">About</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xxxl,
          gap: theme.spacing.xl,
        }}>
        <FadeIn style={[styles.centre, { gap: theme.spacing.md }]}>
          <View style={[styles.mark, { backgroundColor: theme.colors.accent }]}>
            <Glyph name="mic" color={theme.colors.onAccent} size={28} />
          </View>
          <Text variant="display" align="center">
            BeatN
          </Text>
          <Text variant="caption" tone="muted" align="center">
            Version {versionLabel}
          </Text>
        </FadeIn>

        <FadeIn delay={60}>
          <Card title="Your privacy" variant="tinted">
            <Text variant="body">
              Everything you record stays on this phone — encrypted, locked with Face ID, and never
              uploaded. There is no account and no tracking.
            </Text>
            <Row label="Privacy policy" onPress={() => void Linking.openURL(LINKS.privacy)} />
          </Card>
        </FadeIn>

        <FadeIn delay={100}>
          <Card title="Help" variant="raised">
            <Row label="Support and questions" onPress={() => void Linking.openURL(LINKS.support)} />
            <Row label="Email support" onPress={() => void Linking.openURL(supportMailto(versionLabel))} />
            <Text variant="caption" tone="faint">
              Please never include anything from your journal in an email.
            </Text>
          </Card>
        </FadeIn>

        <FadeIn delay={140}>
          <Card title="Built with" variant="flat">
            <Credit name="Whisper" detail="speech recognition model · OpenAI · MIT licence" />
            <Credit name="whisper.cpp and llama.cpp" detail="on-device inference · ggml authors · MIT licence" />
            <Credit name="Qwen2.5" detail="language model · Alibaba Cloud · Apache 2.0 licence" />
            <Credit name="whisper.rn and llama.rn" detail="React Native bindings · MIT licence" />
            <Credit name="Expo and React Native" detail="app framework · MIT licence" />
            <Credit name="SQLCipher" detail="encrypted database · BSD-style licence" />
          </Card>
        </FadeIn>

        <Text variant="caption" tone="faint" align="center">
          BeatN is a journal, not a therapist. Its moods and reflections are generated on this phone
          and can be wrong; nothing in it is medical advice.
        </Text>
      </ScrollView>
    </View>
  );
}

/** A tappable line that opens a page or email outside the app. */
function Row({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="link"
      accessibilityHint="Opens outside BeatN"
      style={[styles.row, { borderTopColor: theme.colors.border }]}>
      <Text variant="bodyStrong" tone="accent">
        {label}
      </Text>
      <View style={{ transform: [{ scaleX: -1 }] }}>
        <Glyph name="back" color={theme.colors.accent} size={12} />
      </View>
    </PressableScale>
  );
}

function Credit({ name, detail }: { name: string; detail: string }) {
  return (
    <View style={styles.credit}>
      <Text variant="bodyStrong">{name}</Text>
      <Text variant="caption" tone="muted">
        {detail}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 40 },
  centre: { alignItems: 'center' },
  mark: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  credit: { gap: 2 },
});
