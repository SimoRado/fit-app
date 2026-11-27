import React, { useCallback, useEffect } from 'react';
import { Pressable, type PressableProps } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from './motion';
import { PRESS_IN_DURATION_MS, PRESS_OUT_DURATION_MS, pressTarget } from '../core/pressMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function MotionPressable({ pressScale = 0.98, selected = false, onPressIn, onPressOut, style, ...props }: PressableProps & { pressScale?: number; selected?: boolean }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (reduced || props.disabled) scale.set(1);
  }, [reduced, props.disabled, scale]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const handleIn = useCallback((event: Parameters<NonNullable<PressableProps['onPressIn']>>[0]) => {
    if (!props.disabled) scale.set(reduced ? 1 : withTiming(pressTarget(pressScale, false, false), { duration: PRESS_IN_DURATION_MS, easing: Easing.out(Easing.quad) }));
    onPressIn?.(event);
  }, [onPressIn, pressScale, props.disabled, reduced, scale]);
  const handleOut = useCallback((event: Parameters<NonNullable<PressableProps['onPressOut']>>[0]) => {
    scale.set(reduced ? 1 : withTiming(1, { duration: PRESS_OUT_DURATION_MS, easing: Easing.out(Easing.quad) }));
    onPressOut?.(event);
  }, [onPressOut, reduced, scale]);
  return <AnimatedPressable {...props} style={[style, animatedStyle]} onPressIn={handleIn} onPressOut={handleOut} accessibilityState={selected ? { ...props.accessibilityState, selected: true } : props.accessibilityState}/>;
}

/**
 * Drop-in `Pressable` with a quick opacity dip on press (UI thread, no re-render). For links,
 * icon buttons, list rows and calendar cells, where scaling would clip or feel heavy. Elements
 * that already pass a `({ pressed }) => style` function keep their own feedback unchanged.
 * The action fires on press as usual; the feedback never delays it.
 */
export function TapPressable({ onPressIn, onPressOut, style, pressedOpacity = 0.62, ...props }: PressableProps & { pressedOpacity?: number }) {
  const opacity = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const handleIn = useCallback((event: Parameters<NonNullable<PressableProps['onPressIn']>>[0]) => {
    if (!props.disabled) opacity.set(withTiming(pressedOpacity, { duration: PRESS_IN_DURATION_MS, easing: Easing.out(Easing.quad) }));
    onPressIn?.(event);
  }, [onPressIn, opacity, pressedOpacity, props.disabled]);
  const handleOut = useCallback((event: Parameters<NonNullable<PressableProps['onPressOut']>>[0]) => {
    opacity.set(withTiming(1, { duration: PRESS_OUT_DURATION_MS, easing: Easing.out(Easing.quad) }));
    onPressOut?.(event);
  }, [onPressOut, opacity]);
  if (typeof style === 'function') return <Pressable {...props} style={style} onPressIn={onPressIn} onPressOut={onPressOut}/>;
  return <AnimatedPressable {...props} style={[style, animatedStyle]} onPressIn={handleIn} onPressOut={handleOut}/>;
}
