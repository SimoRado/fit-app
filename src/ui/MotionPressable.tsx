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
