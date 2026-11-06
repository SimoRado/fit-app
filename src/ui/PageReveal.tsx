import React, { useEffect, useRef, useState } from 'react';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, { Circle, Rect } from 'react-native-svg';
import Animated, { Easing, runOnJS, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { Platform, useWindowDimensions, View } from 'react-native';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const NativeMaskedView = MaskedView as unknown as React.ComponentType<React.ComponentProps<typeof View> & { maskElement: React.ReactElement; androidRenderingMode?: 'software' | 'hardware' }>;

export function PageReveal({ children, sequence }: { children: React.ReactNode; sequence: number }) {
  const { width, height } = useWindowDimensions();
  const radius = useSharedValue(0);
  const [finished, setFinished] = useState(true);
  const lastSequence = useRef(0);
  const maxRadius = Math.hypot(width / 2, height) + 2;

  useEffect(() => {
    if (sequence <= 0 || sequence === lastSequence.current) return;
    lastSequence.current = sequence;
    setFinished(false);
    radius.value = 0;
    radius.value = withTiming(maxRadius, { duration: 550, easing: Easing.bezier(0.22, 1, 0.36, 1) }, complete => {
      if (complete) runOnJS(setFinished)(true);
    });
    return () => { radius.value = maxRadius; };
  }, [maxRadius, radius, sequence]);

  const circleProps = useAnimatedProps(() => ({ r: radius.value }));
  return <NativeMaskedView
    style={{ flex: 1 }}
    androidRenderingMode={Platform.OS === 'android' && !finished ? 'software' : 'hardware'}
    maskElement={<View pointerEvents="none" style={{ width, height, backgroundColor: 'transparent' }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {finished ? <Rect x="0" y="0" width={width} height={height} fill="#fff"/> : <AnimatedCircle cx={width / 2} cy={height} fill="#fff" animatedProps={circleProps}/>}
      </Svg>
    </View>}
  >{children}</NativeMaskedView>;
}
