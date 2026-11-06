import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { useReducedMotion } from './motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function MotionPressable({ pressScale = 0.95, selected = false, onPressIn, onPressOut, style, ...props }: PressableProps & { pressScale?: number; selected?: boolean }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const selectionScale = useSharedValue(1);
  const previousSelected = useRef(selected);
  useEffect(() => {
    if (selected && !previousSelected.current && !reduced) selectionScale.set(withSequence(withSpring(1.12, { damping: 8, stiffness: 260 }), withSpring(1, { damping: 13, stiffness: 180 })));
    else selectionScale.set(1);
    previousSelected.current = selected;
  }, [reduced, selected, selectionScale]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value * selectionScale.value }] }));
  const handleIn = useCallback((event: Parameters<NonNullable<PressableProps['onPressIn']>>[0]) => {
    if (!reduced) scale.set(withSpring(pressScale, { damping: 18, stiffness: 260, mass: 0.7 }));
    onPressIn?.(event);
  }, [onPressIn, pressScale, reduced, scale]);
  const handleOut = useCallback((event: Parameters<NonNullable<PressableProps['onPressOut']>>[0]) => {
    if (!reduced) scale.set(withSpring(1, { damping: 14, stiffness: 220, mass: 0.7 }));
    onPressOut?.(event);
  }, [onPressOut, reduced, scale]);
  return <AnimatedPressable {...props} style={[style, animatedStyle]} onPressIn={handleIn} onPressOut={handleOut}/>;
}
