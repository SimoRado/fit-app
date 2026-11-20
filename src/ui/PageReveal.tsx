import React, { useEffect, useRef } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/** Tab entrance after a bottom-navigation tap. Short so the destination reads as instant. */
export const PAGE_REVEAL_MS = 200;
const START_OPACITY = 0.45;
const START_OFFSET = 10;

/**
 * Lightweight tab entrance: the destination is visible on the first frame (never blank) and
 * settles with an opacity/rise animation that runs entirely on the UI thread.
 *
 * This replaced a full-screen circular MaskedView reveal. That mask re-rendered the whole
 * page in Android *software* mode for 550 ms on every tab tap and kept every tab permanently
 * wrapped in an offscreen mask layer, which made tab switches feel frozen on mid-range phones.
 */
export function PageReveal({ children, sequence }: { children: React.ReactNode; sequence: number }) {
  const progress = useSharedValue(1);
  const lastSequence = useRef(0);
  useEffect(() => {
    if (sequence <= 0 || sequence === lastSequence.current) return;
    lastSequence.current = sequence;
    progress.value = 0;
    progress.value = withTiming(1, { duration: PAGE_REVEAL_MS, easing: Easing.bezier(0.22, 1, 0.36, 1) });
  }, [progress, sequence]);
  const style = useAnimatedStyle(() => ({
    opacity: START_OPACITY + (1 - START_OPACITY) * progress.value,
    transform: [{ translateY: (1 - progress.value) * START_OFFSET }],
  }));
  return <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>;
}
