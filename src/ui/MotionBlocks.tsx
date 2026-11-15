import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Animated, { Easing, interpolate, interpolateColor, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from './motion';
import { getAppearancePalette } from './theme';
import { MotionPressable } from './MotionPressable';
import { useApp } from '../state/app';

export function AnimatedCollapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const [contentHeight, setContentHeight] = useState(0);
  const height = useSharedValue(0);
  useEffect(() => {
    const target = open ? contentHeight : 0;
    height.value = reduced ? target : withTiming(target, { duration: 460, easing: Easing.bezier(0.22, 1, 0.36, 1) });
  }, [contentHeight, height, open, reduced]);
  const style = useAnimatedStyle(() => ({ height: height.value }));
  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (next > 0 && Math.abs(next - contentHeight) > 0.5) setContentHeight(next);
  };
  // The content is positioned absolutely so it keeps its natural height (and
  // reports it) while the clipping container is 0 tall. In normal flow, a
  // collapsed parent left it unmeasured on Android, so it never opened.
  return <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[{ overflow: 'hidden' }, style]}><View onLayout={onLayout} style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>{children}</View></Animated.View>;
}

export function AnimatedWeekBar({ value, maximum, index, color, children }: { value: number; maximum: number; index: number; color: string; children?: React.ReactNode }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  const targetHeight = 230 * Math.min(1, Math.max(0, value / Math.max(1, maximum)));
  useEffect(() => {
    progress.value = reduced ? 1 : 0;
    if (!reduced) progress.value = withDelay(index * 50, withTiming(1, { duration: 800, easing: Easing.bezier(0.34, 1.3, 0.64, 1) }));
  }, [index, progress, reduced, targetHeight]);
  const style = useAnimatedStyle(() => ({ height: targetHeight * progress.value }));
  return <Animated.View style={[{ width: '100%', minHeight: value > 0 ? 4 : 0, borderTopLeftRadius: 16, borderTopRightRadius: 16, justifyContent: 'flex-start', alignItems: 'center', backgroundColor: color }, style]}>{children}</Animated.View>;
}

export function BloomSwitch({ value, onChange, label }: { value: boolean; onChange: () => void; label: string }) {
  const { appearance } = useApp();
  const palette = getAppearancePalette(appearance);
  const reduced = useReducedMotion();
  const progress = useSharedValue(value ? 1 : 0);
  useEffect(() => { progress.value = reduced ? (value ? 1 : 0) : withTiming(value ? 1 : 0, { duration: 170, easing: Easing.out(Easing.cubic) }); }, [progress, reduced, value]);
  const trackStyle = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(progress.value, [0, 1], [palette.line3, palette.accent]) }), [appearance]);
  const knobStyle = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(progress.value, [0, 1], [palette.card, palette.sun]), transform: [{ translateX: interpolate(progress.value, [0, 1], [0, 20]) }] }), [appearance]);
  return <MotionPressable pressScale={0.95} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={onChange} style={{ width: 50, height: 30, borderRadius: 15, justifyContent: 'center', padding: 4 }}>
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 15 }, trackStyle]}/>
    <Animated.View pointerEvents="none" style={[{ width: 22, height: 22, borderRadius: 11 }, knobStyle]}/>
  </MotionPressable>;
}
