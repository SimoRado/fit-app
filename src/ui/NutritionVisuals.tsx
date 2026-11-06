import React, { useEffect, useId, useMemo } from 'react';
import { TextInput } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import { colors, fonts } from './theme';
import { progressRatio } from '../core/nutrition';
import { useReducedMotion, useTabMotion } from './motion';

function blob(cx: number, cy: number, r: number, seed: number, n = 8, amp = 0.16) {
  const points = Array.from({ length: n }, (_, i) => {
    const angle = i / n * Math.PI * 2;
    const rr = r * (1 + amp * Math.sin(seed + i * 2.1) + amp * 0.6 * Math.cos(seed * 1.7 + i * 3.3));
    return [cx + rr * Math.cos(angle), cy + rr * Math.sin(angle)] as const;
  });
  const f = (value: number) => value.toFixed(1);
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}
const vessel = blob(100, 112, 84, 2.3, 8, 0.14);
const wavePath = (y: number, amplitude: number) => `M0 ${y}Q50 ${y - amplitude} 100 ${y}T200 ${y}T300 ${y}T400 ${y}V260H0Z`;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function useLiquidAnimation(targetY: number, duration: number) {
  const reduced = useReducedMotion();
  const level = useSharedValue(230);
  useEffect(() => {
    level.value = reduced
      ? targetY
      : withTiming(targetY, { duration, easing: Easing.bezier(0.34, 1.3, 0.64, 1) });
  }, [duration, level, reduced, targetY]);
  return level;
}

function useWaveMotion(level: { value: number }) {
  const { activeRoute } = useTabMotion();
  const reduced = useReducedMotion();
  const first = useSharedValue(0);
  const second = useSharedValue(-100);
  useEffect(() => {
    cancelAnimation(first);
    cancelAnimation(second);
    if (activeRoute === 'nutrition' && !reduced) {
      first.value = withRepeat(withTiming(-200, { duration: 5200, easing: Easing.linear }), -1, false);
      second.value = withRepeat(withTiming(0, { duration: 6800, easing: Easing.linear }), -1, false);
    } else {
      first.value = 0;
      second.value = -100;
    }
    return () => { cancelAnimation(first); cancelAnimation(second); };
  }, [activeRoute, first, reduced, second]);
  const firstProps = useAnimatedProps(() => ({ translate: [first.value, level.value] }));
  const secondProps = useAnimatedProps(() => ({ translate: [second.value, level.value] }));
  return { firstProps, secondProps };
}

export function AnimatedNumber({ value, style, accessibilityLabel }: { value: number; style?: any; accessibilityLabel?: string }) {
  const reduced = useReducedMotion();
  const current = useSharedValue(reduced ? value : 0);
  useEffect(() => {
    current.value = reduced ? value : withTiming(value, { duration: 800, easing: Easing.out(Easing.cubic) });
  }, [current, reduced, value]);
  const animatedProps = useAnimatedProps(() => {
    const rounded = Math.round(current.value);
    const negative = rounded < 0 ? '-' : '';
    const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const text = negative + digits;
    return { text, defaultValue: text };
  });
  return <AnimatedTextInput pointerEvents="none" accessibilityLabel={accessibilityLabel} editable={false} focusable={false} caretHidden underlineColorAndroid="transparent" animatedProps={animatedProps} style={[{ padding: 0, margin: 0, color: colors.ink, fontFamily: fonts.displayHeavy, includeFontPadding: false, backgroundColor: 'transparent', writingDirection: 'ltr' }, style]}/>;
}

export function NutritionVessel({ consumed, target, size = 154 }: { consumed: number; target: number; size?: number }) {
  const id = `nutrition-vessel-${useId().replace(/:/g, '')}`;
  const ratio = progressRatio(consumed, target);
  const level = useLiquidAnimation(196 - ratio * 160, 1300);
  const { firstProps, secondProps } = useWaveMotion(level);
  const over = target > 0 && consumed > target * 1.02;
  const fill = over ? colors.accent : colors.sun;
  const wave = over ? colors.accent : colors.coral;
  const levelProps = useAnimatedProps(() => ({ y: level.value, height: 260 - level.value }));
  return <Svg width={size} height={size * 1.12} viewBox="0 0 200 224" accessibilityLabel={`${Math.round(ratio * 100)} percent of calorie target`}>
    <Defs><ClipPath id={id}><Path d={vessel}/></ClipPath></Defs>
    <Path d={vessel} fill="rgba(255,255,255,.55)"/>
    <G clipPath={`url(#${id})`}>
      <AnimatedRect x="0" width="200" fill={fill} animatedProps={levelProps}/>
      <G clipPath={`url(#${id})`}>
        <AnimatedG animatedProps={firstProps}><Path d={wavePath(0, 9)} fill={fill} opacity={0.75}/></AnimatedG>
      </G>
      <AnimatedG clipPath={`url(#${id})`} animatedProps={secondProps}>
        <Path d={wavePath(6, 7)} fill={wave} opacity={0.9}/>
      </AnimatedG>
    </G>
    <Path d={vessel} fill="none" stroke={colors.ink} strokeWidth={3} opacity={0.85}/>
  </Svg>;
}

export function NutritionScene() {
  const { activeRoute } = useTabMotion();
  const reduced = useReducedMotion();
  const first = useSharedValue(0);
  const second = useSharedValue(1);
  const d1 = useMemo(() => blob(250, 73.5, 115, 214 * 0.7), []);
  const d2 = useMemo(() => blob(30, 350, 125, 214 * 1.3), []);
  useEffect(() => {
    cancelAnimation(first);
    cancelAnimation(second);
    if (activeRoute === 'nutrition' && !reduced) {
      first.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.quad) }), -1, true);
      second.value = withRepeat(withTiming(0, { duration: 11000, easing: Easing.inOut(Easing.quad) }), -1, true);
    } else { first.value = 0; second.value = 1; }
    return () => { cancelAnimation(first); cancelAnimation(second); };
  }, [activeRoute, first, reduced, second]);
  const firstProps = useAnimatedProps(() => ({ translate: [8 * first.value, -10 * first.value] }));
  const secondProps = useAnimatedProps(() => ({ translate: [8 * second.value, -10 * second.value] }));
  return <Svg pointerEvents="none" width="100%" height="100%" viewBox="0 0 300 420" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
    <Rect width="300" height="420" fill="#FFE7A3"/>
    <AnimatedG animatedProps={firstProps}><Path d={d1} fill="#FF9F80"/></AnimatedG>
    <AnimatedG animatedProps={secondProps}><Path d={d2} fill={colors.lilac} opacity={0.9}/></AnimatedG>
    <Circle cx="255" cy="93" r="20" fill={colors.bg} opacity={0.75}/>
  </Svg>;
}

export function NutritionPebble({ consumed, target, color }: { consumed: number; target: number | null; color: string }) {
  const id = `nutrition-pebble-${useId().replace(/:/g, '')}`;
  const shape = useMemo(() => blob(50, 50, 44, 10, 7, 0.1), []);
  const level = useLiquidAnimation(90 - progressRatio(consumed, target) * 80, 1100);
  const { firstProps, secondProps } = useWaveMotion(level);
  const levelProps = useAnimatedProps(() => ({ y: level.value, height: 150 - level.value }));
  return <Svg width={88} height={88} viewBox="0 0 100 100">
    <Defs><ClipPath id={id}><Path d={shape}/></ClipPath></Defs>
    <Path d={shape} fill="rgba(255,255,255,.7)"/>
    <G clipPath={`url(#${id})`}>
      <AnimatedRect x="0" width="100" fill={color} animatedProps={levelProps}/>
      <AnimatedG clipPath={`url(#${id})`} animatedProps={firstProps}><G transform="scale(.5 1)"><Path d={wavePath(0, 4)} fill={color} opacity={0.6}/></G></AnimatedG>
      <AnimatedG clipPath={`url(#${id})`} animatedProps={secondProps}><G transform="scale(.5 1)"><Path d={wavePath(3, 3.5)} fill={color}/></G></AnimatedG>
    </G>
    <Path d={shape} fill="none" stroke={colors.ink} strokeWidth={2.2} opacity={0.8}/>
  </Svg>;
}

export function NutritionRing({ ratio }: { ratio: number }) {
  const circumference = 2 * Math.PI * 14;
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? progressRatio(ratio, 1) : 0);
  useEffect(() => {
    const value = Math.min(1, Math.max(0, ratio));
    progress.value = reduced ? value : withTiming(value, { duration: 800, easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
  }, [progress, ratio, reduced]);
  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - progress.value) }));
  return <Svg width={34} height={34} viewBox="0 0 34 34"><Circle cx={17} cy={17} r={14} stroke={colors.borderStrong} strokeWidth={3.5} fill="none"/><AnimatedCircle cx={17} cy={17} r={14} stroke={colors.accent} strokeWidth={3.5} fill="none" strokeDasharray={`${circumference}`} animatedProps={arcProps} rotation={-90} origin="17,17" strokeLinecap="round"/></Svg>;
}
