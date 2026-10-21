import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

export type GlyphName = 'mic' | 'stop' | 'play' | 'pause' | 'close' | 'back' | 'lock';

export interface GlyphProps {
  name: GlyphName;
  color: string;
  /** Bounding box edge, in points. */
  size?: number;
}

/**
 * A handful of icons drawn from plain Views.
 *
 * The app needs seven icons. An icon font or SVG renderer would add a native
 * dependency and a rebuild for that; these are geometric enough to draw.
 */
export function Glyph({ name, color, size = 24 }: GlyphProps) {
  const s = size;
  const stroke = Math.max(1.5, s / 12);

  let content: ReactNode = null;
  switch (name) {
    case 'mic':
      content = (
        <>
          <View
            style={{
              position: 'absolute',
              top: s * 0.06,
              left: s * 0.34,
              width: s * 0.32,
              height: s * 0.52,
              borderRadius: s * 0.16,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: s * 0.3,
              left: s * 0.2,
              width: s * 0.6,
              height: s * 0.42,
              borderBottomLeftRadius: s * 0.3,
              borderBottomRightRadius: s * 0.3,
              borderWidth: stroke,
              borderTopWidth: 0,
              borderColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: s * 0.72,
              left: (s - stroke) / 2,
              width: stroke,
              height: s * 0.16,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: s * 0.86,
              left: s * 0.32,
              width: s * 0.36,
              height: stroke,
              borderRadius: stroke,
              backgroundColor: color,
            }}
          />
        </>
      );
      break;
    case 'stop':
      content = (
        <View
          style={{
            width: s * 0.62,
            height: s * 0.62,
            borderRadius: s * 0.14,
            backgroundColor: color,
          }}
        />
      );
      break;
    case 'play':
      content = (
        <View
          style={{
            marginLeft: s * 0.12,
            width: 0,
            height: 0,
            borderTopWidth: s * 0.36,
            borderBottomWidth: s * 0.36,
            borderLeftWidth: s * 0.6,
            borderTopColor: 'transparent',
            borderBottomColor: 'transparent',
            borderLeftColor: color,
          }}
        />
      );
      break;
    case 'pause':
      content = (
        <View style={{ flexDirection: 'row', gap: s * 0.18 }}>
          <View style={{ width: s * 0.2, height: s * 0.66, borderRadius: s * 0.05, backgroundColor: color }} />
          <View style={{ width: s * 0.2, height: s * 0.66, borderRadius: s * 0.05, backgroundColor: color }} />
        </View>
      );
      break;
    case 'close':
      content = (
        <>
          {[45, -45].map((deg) => (
            <View
              key={deg}
              style={{
                position: 'absolute',
                width: s * 0.72,
                height: stroke,
                borderRadius: stroke,
                backgroundColor: color,
                transform: [{ rotate: `${deg}deg` }],
              }}
            />
          ))}
        </>
      );
      break;
    case 'back':
      content = (
        <View
          style={{
            marginLeft: s * 0.16,
            width: s * 0.44,
            height: s * 0.44,
            borderLeftWidth: stroke,
            borderBottomWidth: stroke,
            borderColor: color,
            transform: [{ rotate: '45deg' }],
          }}
        />
      );
      break;
    case 'lock':
      content = (
        <>
          <View
            style={{
              position: 'absolute',
              top: s * 0.08,
              width: s * 0.5,
              height: s * 0.5,
              borderRadius: s * 0.25,
              borderWidth: stroke,
              borderColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: s * 0.06,
              width: s * 0.72,
              height: s * 0.52,
              borderRadius: s * 0.1,
              backgroundColor: color,
            }}
          />
        </>
      );
      break;
  }

  return (
    <View
      style={[styles.box, { width: s, height: s }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});
