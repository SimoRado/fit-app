import React, { useEffect } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { localize } from '../core/i18n';
import { useApp } from '../state/app';
import { Text } from './LocalizedText';
import { Button } from './components';
import { useReducedMotion } from './motion';
import { radii } from './theme';
import { usePalette } from './voltKit';

/**
 * Loading placeholders that follow the real screen geometry.
 *
 * Performance: a skeleton screen runs ONE opacity animation on its root (UI thread,
 * Reanimated), never one per block. The pulse starts after `PULSE_DELAY_MS`, so a local
 * SQLite read that finishes quickly swaps a still placeholder for content with no visible
 * motion. Reduced motion keeps the placeholder still. Blocks are plain Views.
 *
 * Accessibility: the root is a single accessible element announced as "Loading …" with a
 * busy state; every placeholder inside is hidden from assistive technology, so no fake
 * labels, buttons or numbers are ever read out.
 */
export const PULSE_DELAY_MS = 350;
const PULSE_MS = 900;
const PULSE_MIN_OPACITY = 0.55;

/** `label` is announced once; a group without one is hidden from assistive technology entirely. */
export function SkeletonScreen({ label, children, style }: { label?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const { language } = useApp();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduced) { opacity.value = 1; return; }
    opacity.value = withDelay(PULSE_DELAY_MS, withRepeat(withSequence(
      withTiming(PULSE_MIN_OPACITY, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }),
      withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }),
    ), -1));
    return () => { cancelAnimation(opacity); };
  }, [opacity, reduced]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const a11y = label
    ? { accessible: true, accessibilityRole: 'progressbar' as const, accessibilityLabel: localize(label, language), accessibilityState: { busy: true } }
    : { accessible: false, importantForAccessibility: 'no-hide-descendants' as const, accessibilityElementsHidden: true };
  return <Animated.View {...a11y} style={[{ gap: 12 }, style, pulse]}>
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ gap: 12 }}>{children}</View>
  </Animated.View>;
}

export function SkeletonBlock({ width = '100%', height, radius = 10, style }: { width?: DimensionValue; height: DimensionValue; radius?: number; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return <View style={[{ width, height, borderRadius: radius, backgroundColor: p.skeleton }, style]}/>;
}

export function SkeletonCircle({ size, style }: { size: number; style?: StyleProp<ViewStyle> }) {
  return <SkeletonBlock width={size} height={size} radius={size / 2} style={style}/>;
}

/** Text lines: `size` is the font size the line stands in for; the last line is shorter. */
export function SkeletonText({ lines = 1, size = 13, width = '70%', lastWidth = '45%', style }: { lines?: number; size?: number; width?: DimensionValue; lastWidth?: DimensionValue; style?: StyleProp<ViewStyle> }) {
  const height = Math.round(size * 0.78);
  return <View style={[{ gap: Math.round(size * 0.55) }, style]}>
    {Array.from({ length: lines }, (_, index) => <SkeletonBlock key={index} width={lines > 1 && index === lines - 1 ? lastWidth : width} height={height} radius={height / 2}/>)}
  </View>;
}

/** The `.card8` surface (VCard) with placeholders inside. */
export function SkeletonCard({ children, style, tone = 'card' }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'card' | 'soft' }) {
  const p = usePalette();
  return <View style={[{ padding: 16, gap: 12, borderRadius: radii.card, backgroundColor: tone === 'soft' ? p.soft1 : p.c8, borderWidth: 1, borderColor: p.light ? 'transparent' : p.c8Line }, style]}>{children}</View>;
}

/** A `.row8` list row placeholder: icon tile, two text lines, trailing value. */
export function SkeletonRow({ trailing = true }: { trailing?: boolean }) {
  return <SkeletonCard style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: radii.row }}>
    <SkeletonBlock width={42} height={42} radius={14}/>
    <View style={{ flex: 1, gap: 7 }}><SkeletonBlock width="48%" height={12} radius={6}/><SkeletonBlock width="72%" height={10} radius={5}/></View>
    {trailing && <SkeletonBlock width={40} height={14} radius={7}/>}
  </SkeletonCard>;
}

/**
 * First-load failure: a real error with a retry instead of a skeleton that never ends.
 * (Refresh failures after content is shown keep the content and use the existing alert.)
 */
export function LoadError({ text = 'Could not load this screen.', onRetry }: { text?: string; onRetry: () => void }) {
  const p = usePalette();
  return <SkeletonCard style={{ alignItems: 'flex-start', gap: 10 }}>
    <Text accessibilityRole="alert" style={{ color: p.text, fontSize: 14.5, lineHeight: 20 }}>{text} Your data is still saved on this device.</Text>
    <Button title="Try again" kind="ghost" onPress={onRetry}/>
  </SkeletonCard>;
}
