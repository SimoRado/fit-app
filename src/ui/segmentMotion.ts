import { useCallback, useEffect, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { MOTION } from '../core/pressMotion';
import { useReducedMotion } from './motion';

/**
 * Sliding thumb for pill segmented controls (track padding 4). Runs on the UI thread; the only
 * React update is the one-time width measurement. Snaps instantly with reduced motion.
 * Pass `rtl` so the thumb travels the right way in Arabic.
 */
export function useSegmentThumb(index: number, count: number, rtl = false) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const position = useSharedValue(index);
  useEffect(() => { position.value = reduced ? index : withTiming(index, { duration: MOTION.segment, easing: Easing.out(Easing.cubic) }); }, [index, position, reduced]);
  const cell = Math.max(0, (width - 8) / Math.max(1, count));
  const direction = rtl ? -1 : 1;
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: position.value * cell * direction }] }), [cell, direction]);
  const onLayout = useCallback((event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width), []);
  return { onLayout, thumbStyle, cell, measured: width > 0 };
}
