import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, useWindowDimensions, View } from 'react-native';
import Reanimated, { Easing, interpolate, interpolateColor, useAnimatedProps, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Ellipse, Path } from 'react-native-svg';
import { Text } from './LocalizedText';
import { colors, fonts, shadows } from './theme';
import { useReducedMotion } from './motion';
import { useApp } from '../state/app';
import { localize } from '../core/i18n';
import { message } from './components';

const AnimatedPath = Reanimated.createAnimatedComponent(Path);

export function SectionHeader({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 24, marginBottom: 2 }}>
    <Text accessibilityRole="header" style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 25, lineHeight: 29, letterSpacing: -.6, flexShrink: 1, includeFontPadding: false }}>{title}</Text>
    {action && onPress && <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>{action}</Text></Pressable>}
  </View>;
}

export function TickDial({ value, label }: { value: number; label: string }) {
  const { width } = useWindowDimensions();
  const target = Math.max(0, Math.min(100, Math.round(value)));
  const size = Math.min(width - 36, 350);
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: target }} accessibilityLabel={label} style={{ width: size, height: size, alignSelf: 'center', marginTop: 6 }}>
    <Svg width="100%" height="100%" viewBox="0 0 350 350">
      <Ellipse cx="175" cy="103" rx="52" ry="91" fill="none" stroke={colors.accent} strokeWidth="2" strokeDasharray="3 5"/>
      <Ellipse cx="175" cy="247" rx="52" ry="91" fill="none" stroke={colors.coral} strokeWidth="2" strokeDasharray="3 5"/>
      <Ellipse cx="100" cy="175" rx="91" ry="52" fill="none" stroke={colors.lilac} strokeWidth="2" strokeDasharray="3 5"/>
      <Ellipse cx="250" cy="175" rx="91" ry="52" fill="none" stroke={colors.mint} strokeWidth="2" strokeDasharray="3 5"/>
      <Ellipse cx="175" cy="111" rx="38" ry="62" fill={colors.accent} opacity={target / 100}/>
    </Svg>
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}><Text style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: width < 375 ? 76 : 84, lineHeight: 89, letterSpacing: -3 }}>{target}</Text><Text style={{ color: colors.coral, fontFamily: fonts.displayHeavy, fontSize: 27, marginTop: 8 }}>%</Text></View>
      <Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: .7, textAlign: 'center', textTransform: 'uppercase' }}>{label}</Text>
    </View>
  </View>;
}

export function ProgressBar({ value }: { value: number }) {
  const progress = Math.max(0, Math.min(1, value));
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }} style={{ height: 8, borderRadius: 999, backgroundColor: colors.card2, overflow: 'hidden' }}>
    <View style={{ height: '100%', width: `${progress * 100}%`, borderRadius: 999, backgroundColor: colors.accent }}/>
  </View>;
}

export function Reveal({ children }: { children: React.ReactNode }) {
  return <View>{children}</View>;
}

export function TransformationRuler({ progress, start, current, target }: { progress: number; start: number; current: number; target: number }) {
  const lit = Math.round(Math.max(0, Math.min(100, progress)) / 100 * 90);
  return <View style={{ gap: 12 }}>
    <View style={{ height: 122, flexDirection: 'row', alignItems: 'flex-end', gap: 1 }}>
      {Array.from({ length: 90 }, (_, i) => <View key={i} style={{ flex: 1, height: i % 10 === 0 ? 100 : 72, backgroundColor: i < lit ? colors.sun : colors.elevated, opacity: i < lit ? .8 : .4 }}/>) }
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Starting: {start} kg</Text><Text style={{ color: colors.text, fontSize: 12 }}>Latest: {current} kg</Text><Text style={{ color: colors.accent, fontSize: 12 }}>Target: {target} kg</Text>
    </View>
  </View>;
}

export function HabitCheck({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void | Promise<void> }) {
  const { language } = useApp();
  const reduced = useReducedMotion();
  const previous = useRef(checked);
  const progress = useSharedValue(checked ? 1 : 0);
  const checkProgress = useSharedValue(checked ? 1 : 0);
  const pop = useSharedValue(1);
  const burst = useSharedValue(0);
  useEffect(() => {
    progress.value = reduced ? (checked ? 1 : 0) : withSpring(checked ? 1 : 0, { damping: 14, stiffness: 180, mass: 0.7 });
    checkProgress.value = reduced ? (checked ? 1 : 0) : withTiming(checked ? 1 : 0, { duration: 360, easing: Easing.out(Easing.cubic) });
    if (checked && !previous.current && !reduced) {
      pop.value = withSequence(withSpring(1.2, { damping: 7, stiffness: 260 }), withSpring(1, { damping: 12, stiffness: 180 }));
      burst.value = withSequence(withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 340, easing: Easing.out(Easing.quad) }));
    }
    previous.current = checked;
  }, [burst, checkProgress, checked, pop, progress, reduced]);
  const bubbleStyle = useAnimatedStyle(() => {
    const corner = interpolate(progress.value, [0, 1], [19, 6]);
    return { borderTopLeftRadius: 19, borderTopRightRadius: corner, borderBottomRightRadius: 19, borderBottomLeftRadius: corner, borderColor: interpolateColor(progress.value, [0, 1], [colors.line3, colors.sun]), backgroundColor: interpolateColor(progress.value, [0, 1], [colors.card, colors.sun]), transform: [{ scale: pop.value }] };
  });
  const sparkleStyle = useAnimatedStyle(() => ({ opacity: burst.value, transform: [{ scale: interpolate(burst.value, [0, 1], [0.5, 1.2]) }] }));
  const checkProps = useAnimatedProps(() => ({ strokeDashoffset: 22 * (1 - checkProgress.value) }));
  const locked = useRef(false);
  async function press() {
    if (locked.current) return;
    locked.current = true;
    try { await onPress(); } catch (error) { message(error); } finally { locked.current = false; }
  }
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={localize(label, language)} onPress={() => { void press(); }} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
    <Reanimated.View style={[{ width: 38, height: 38, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, bubbleStyle]}>
      <Svg width={24} height={24} viewBox="0 0 24 24"><AnimatedPath d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={colors.ink} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="22" animatedProps={checkProps}/></Svg>
    </Reanimated.View>
    <Reanimated.View pointerEvents="none" style={[{ position: 'absolute', top: 1, right: 0 }, sparkleStyle]}><Ionicons name="sparkles" size={14} color={colors.coral}/></Reanimated.View>
  </Pressable>;
}

export function FavoriteButton({ selected, onPress }: { selected: boolean; onPress: () => void | Promise<void> }) {
  const reduced = useReducedMotion();
  const { language } = useApp();
  const [scale] = useState(() => new Animated.Value(1));
  const previous = useRef(selected);
  const pending = useRef(false);
  useEffect(() => {
    if (selected && !previous.current && !reduced) Animated.sequence([Animated.timing(scale, { toValue: 1.2, duration: 130, useNativeDriver: true }), Animated.spring(scale, { toValue: 1, useNativeDriver: true })]).start();
    previous.current = selected;
  }, [reduced, scale, selected]);
  const label = selected ? 'Remove favorite' : 'Save favorite';
  return <Animated.View style={{ transform: [{ scale }] }}><Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={localize(label, language)} onPress={() => { if (pending.current) return; pending.current = true; try { void Promise.resolve(onPress()).catch(message).finally(() => { pending.current = false; }); } catch (error) { pending.current = false; message(error); } }} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, borderRadius: 999, backgroundColor: selected ? colors.coral : colors.card, ...shadows.card }}><Ionicons name={selected ? 'heart' : 'heart-outline'} size={21} color={colors.ink}/><Text style={{ color: colors.ink, fontSize: 13, fontFamily: fonts.bold }}>{label}</Text></Pressable></Animated.View>;
}

export function MotivationCard({ text, category, compact = false }: { text: string; category: string; onMove?: (direction: number) => void; compact?: boolean }) {
  const fill = category === 'Fitness' ? colors.mint : category === 'Consistency' ? colors.lilac : category === 'Confidence' ? colors.sky : category === 'Productivity' ? colors.lilac : colors.sun;
  return <View style={{ height: compact ? 230 : 390, overflow: 'hidden', borderRadius: 38, backgroundColor: fill, ...shadows.card }}>
    <View pointerEvents="none" style={{ position: 'absolute', right: -95, top: -70, width: 285, height: 260, borderRadius: 135, backgroundColor: colors.coral, opacity: .75 }}/>
    <View pointerEvents="none" style={{ position: 'absolute', right: 60, top: 105, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.card, opacity: .55 }}/>
    <View style={{ flex: 1, justifyContent: 'space-between', padding: 24 }}>
      <Text style={{ color: colors.ink, fontFamily: fonts.bold, fontSize: 11, letterSpacing: .5 }}>{category}</Text>
      <View style={{ gap: 16 }}><View style={{ height: 5, width: 78, borderRadius: 3, backgroundColor: colors.ink }}/><Text style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: compact ? 27 : 34, lineHeight: compact ? 31 : 35, letterSpacing: -.8, textTransform: 'uppercase' }}>{text}</Text></View>
    </View>
  </View>;
}
