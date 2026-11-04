import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, G, Line, LinearGradient, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Text } from './LocalizedText';
import { colors, fonts } from './theme';
import { useReducedMotion } from './motion';
import { useApp } from '../state/app';
import { localize } from '../core/i18n';
import { message } from './components';
import { DisplayMetric } from './DisplayMetric';

export function SectionHeader({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
    <Text accessibilityRole="header" style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 30, lineHeight: 32, flexShrink: 1, textTransform: 'uppercase', includeFontPadding: false }}>{title}</Text>
    {action && onPress && <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>{action}</Text></Pressable>}
  </View>;
}

export function TickDial({ value, label }: { value: number; label: string }) {
  const { width } = useWindowDimensions();
  const target = Math.max(0, Math.min(100, Math.round(value)));
  const reduced = useReducedMotion();
  const [displayed, setDisplayed] = useState(target);
  const last = useRef(target);
  const animatedOnce = useRef(false);
  useEffect(() => {
    if (reduced) { last.current = target; setDisplayed(target); return; }
    const from = animatedOnce.current ? last.current : 0;
    animatedOnce.current = true;
    const start = Date.now();
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / 650);
      const next = Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3)));
      last.current = next; setDisplayed(next);
      if (t >= 1) clearInterval(timer);
    }, 40);
    return () => clearInterval(timer);
  }, [target, reduced]);
  const lit = Math.round(displayed / 100 * 72);
  const dialWidth = Math.min(width, 430);
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: target }} accessibilityLabel={label} style={{ width: dialWidth, maxWidth: '116%', alignSelf: 'center', aspectRatio: 390 / 350, marginTop: 4 }}>
    <Svg width="100%" height="100%" viewBox="0 0 390 350">
      <Defs><RadialGradient id="dial-glow" cx="50%" cy="55%" rx="47%" ry="47%"><Stop offset="0%" stopColor={colors.accent} stopOpacity=".23"/><Stop offset="100%" stopColor={colors.bg} stopOpacity="0"/></RadialGradient></Defs>
      <Rect width="390" height="350" fill="url(#dial-glow)"/>
      {Array.from({ length: 72 }, (_, i) => {
        const angle = (135 + 270 * i / 71) * Math.PI / 180;
        const major = i % 9 === 0, on = i < lit, tip = i === lit - 1;
        const inner = major ? 112 : 126, outer = tip ? 216 : on ? 198 : 184;
        return <Line key={i} x1={195 + Math.cos(angle) * inner} y1={200 + Math.sin(angle) * inner} x2={195 + Math.cos(angle) * outer} y2={200 + Math.sin(angle) * outer} stroke={on ? colors.accent : colors.elevated} strokeWidth={tip ? 5.5 : on ? 3.5 : 3} strokeLinecap="round"/>;
      })}
    </Svg>
    <View style={{ position: 'absolute', left: 0, right: 0, top: '17%', bottom: '4%', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><DisplayMetric value={displayed} size={width < 375 ? 136 : 154}/><Text style={{ color: colors.accent, fontFamily: fonts.displayHeavy, fontSize: 35, marginTop: 18 }}>%</Text></View>
      <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.8, textAlign: 'center', textTransform: 'uppercase' }}>{label}</Text>
    </View>
  </View>;
}

export function ProgressBar({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const [anim] = useState(() => new Animated.Value(0));
  const progress = Math.max(0, Math.min(1, value));
  useEffect(() => {
    if (reduced) { anim.setValue(progress); return; }
    const animation = Animated.timing(anim, { toValue: progress, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [anim, progress, reduced]);
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }} style={{ height: 6, backgroundColor: colors.elevated, overflow: 'hidden' }}>
    <Animated.View style={{ height: '100%', width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), backgroundColor: colors.accent }}/>
  </View>;
}

export function Reveal({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const [value] = useState(() => new Animated.Value(1));
  useEffect(() => {
    value.setValue(reduced ? 1 : 0);
    if (!reduced) Animated.timing(value, { toValue: 1, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [reduced, value]);
  return <Animated.View style={{ opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>{children}</Animated.View>;
}

export function TransformationRuler({ progress, start, current, target }: { progress: number; start: number; current: number; target: number }) {
  const reduced = useReducedMotion();
  const [reveal] = useState(() => new Animated.Value(1));
  useEffect(() => {
    reveal.setValue(reduced ? 1 : 0);
    if (!reduced) Animated.timing(reveal, { toValue: 1, duration: 700, useNativeDriver: true }).start();
  }, [reduced, reveal, progress]);
  const lit = Math.round(Math.max(0, Math.min(100, progress)) / 100 * 90);
  return <View style={{ gap: 12 }}>
    <View style={{ height: 122, flexDirection: 'row', alignItems: 'flex-end', gap: 1 }}>
      {Array.from({ length: 90 }, (_, i) => <Animated.View key={i} style={{ flex: 1, height: i % 10 === 0 ? 100 : 72, backgroundColor: i < lit ? i === lit - 1 ? '#FFB38F' : colors.accent : colors.elevated, opacity: reveal.interpolate({ inputRange: [i / 90, (i + 1) / 90], outputRange: [0, i < lit ? .35 + i / 130 : .3], extrapolate: 'clamp' }) }}/>) }
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Starting: {start} kg</Text><Text style={{ color: colors.text, fontSize: 12 }}>Latest: {current} kg</Text><Text style={{ color: colors.accent, fontSize: 12 }}>Target: {target} kg</Text>
    </View>
  </View>;
}

export function HabitCheck({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void | Promise<void> }) {
  const reduced = useReducedMotion();
  const { language } = useApp();
  const [scale] = useState(() => new Animated.Value(1));
  const [ring] = useState(() => new Animated.Value(1));
  const previous = useRef(checked);
  const locked = useRef(false);
  useEffect(() => {
    if (previous.current !== checked && checked && !reduced) {
      ring.setValue(0);
      Animated.parallel([
        Animated.sequence([Animated.timing(scale, { toValue: 1.16, duration: 120, useNativeDriver: true }), Animated.spring(scale, { toValue: 1, useNativeDriver: true })]),
        Animated.timing(ring, { toValue: 1, duration: 480, useNativeDriver: true }),
      ]).start();
    }
    previous.current = checked;
  }, [checked, reduced, ring, scale]);
  async function press() {
    if (locked.current) return;
    locked.current = true;
    try { await onPress(); } catch (error) { message(error); } finally { locked.current = false; }
  }
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={localize(label, language)} onPress={() => { void press(); }} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
    <Animated.View pointerEvents="none" style={{ position: 'absolute', width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: colors.accent, opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [.8, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }] }}/>
    <Animated.View style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: checked ? colors.accent : colors.border, backgroundColor: checked ? colors.accent : colors.card2, alignItems: 'center', justifyContent: 'center', transform: [{ scale }] }}>
      {checked && <Ionicons name="checkmark" size={23} color={colors.accentText}/>}
    </Animated.View>
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
  return <Animated.View style={{ transform: [{ scale }] }}><Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={localize(label, language)} onPress={() => { if (pending.current) return; pending.current = true; try { void Promise.resolve(onPress()).catch(message).finally(() => { pending.current = false; }); } catch (error) { pending.current = false; message(error); } }} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: selected ? colors.accent : colors.border, backgroundColor: colors.card2 }}><Ionicons name={selected ? 'heart' : 'heart-outline'} size={21} color={selected ? colors.accent : colors.text}/><Text style={{ color: selected ? colors.accent : colors.text, fontSize: 13 }}>{label}</Text></Pressable></Animated.View>;
}

export function Artwork({ category }: { category: string }) {
  const id = 'scene-' + category.replace(/[^a-z]/gi, '');
  return <Svg pointerEvents="none" width="100%" height="100%" viewBox="0 0 300 420" preserveAspectRatio="xMidYMid slice">
    <Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#383039"/><Stop offset="48%" stopColor="#151A21"/><Stop offset="1" stopColor={colors.bg}/></LinearGradient></Defs>
    <Rect width="300" height="420" fill={'url(#' + id + ')'}/>
    {category === 'Fitness' ? <G><Rect x="0" y="236" width="300" height="8" fill="#323A45"/><Rect x="0" y="236" width="300" height="2" fill={colors.accent} opacity={.7}/>{[0, 1, 2].map(i => <React.Fragment key={i}><Rect x={30 + i * 19} y={135 + i * 28} width={16 - i * 3} height={210 - i * 56} rx="4" fill="#161A20" stroke="#38414D"/><Rect x={254 - i * 19} y={135 + i * 28} width={16 - i * 3} height={210 - i * 56} rx="4" fill="#161A20" stroke="#38414D"/></React.Fragment>)}</G>
      : category === 'Consistency' ? <G>{Array.from({ length: 7 }, (_, i) => <Rect key={i} x={i * 46 - 6} y={360 - i * 44} width="60" height="480" fill="#10141A" stroke="#303640"/>)}<Rect x="264" y="96" width="60" height="3" fill={colors.accent}/></G>
      : category === 'Confidence' ? <G><Circle cx="150" cy="200" r="82" fill={colors.accent}/>{[206, 220, 235, 252].map((y, i) => <Rect key={y} x="60" y={y} width="180" height={3 + i * 3} fill={colors.bg}/>)}<Rect x="0" y="270" width="300" height="150" fill={colors.bg}/></G>
      : category === 'Productivity' ? <G>{[34, 74, 114, 154].map((r, i) => <Circle key={r} cx="150" cy="200" r={r} fill="none" stroke={i ? '#303640' : colors.accent} strokeWidth="2"/>)}<Line x1="150" y1="20" x2="150" y2="380" stroke="#303640"/><Line x1="0" y1="200" x2="300" y2="200" stroke="#303640"/><Circle cx="150" cy="200" r="6" fill={colors.accent}/></G>
      : category === 'Personal Growth' ? <G><Circle cx="205" cy="168" r="36" fill={colors.accent}/><Polygon points="0,300 70,200 120,260 190,150 260,250 300,215 300,420 0,420" fill="#151A21"/><Polygon points="0,350 60,285 110,330 170,255 240,335 300,300 300,420 0,420" fill="#0D1015"/></G>
      : <G><Circle cx="230" cy="290" r="212" fill="#0C0F13" stroke="#303640" strokeWidth="3"/><Circle cx="230" cy="290" r="172" fill="none" stroke="#1D232B" strokeWidth="10"/><Circle cx="230" cy="290" r="128" fill="#0A0C10" stroke="#303640" strokeWidth="2"/><Circle cx="230" cy="290" r="92" fill="none" stroke={colors.accent} strokeOpacity=".5" strokeWidth="2"/><Circle cx="230" cy="290" r="26" fill="#171B21" stroke="#3A424D" strokeWidth="3"/></G>}
  </Svg>;
}

export function MotivationCard({ text, category, onMove, compact = false }: { text: string; category: string; onMove?: (direction: number) => void; compact?: boolean }) {
  const reduced = useReducedMotion();
  const [x] = useState(() => new Animated.Value(0));
  const [busy, setBusy] = useState(false);
  const pan = useMemo(() => {
    return PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => !!onMove && !busy && Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.3,
    onPanResponderMove: (_, gesture) => x.setValue(gesture.dx),
    onPanResponderRelease: (_, gesture) => {
      if (!onMove || busy) return;
      if (Math.abs(gesture.dx) < 65) { Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(); return; }
      setBusy(true);
      const direction = gesture.dx < 0 ? 1 : -1;
      if (reduced) { x.setValue(0); onMove(direction); setBusy(false); return; }
      Animated.timing(x, { toValue: direction * -380, duration: 200, useNativeDriver: true }).start(() => { onMove(direction); x.setValue(0); setBusy(false); });
    },
    onPanResponderTerminate: () => { Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(); },
    });
  }, [busy, onMove, reduced, x]);
  return <Animated.View {...pan.panHandlers} style={{ height: compact ? 230 : 360, overflow: 'hidden', backgroundColor: colors.card2, transform: [{ translateX: x }, { rotate: x.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-8deg', '0deg', '8deg'], extrapolate: 'clamp' }) }] }}>
    <View style={StyleSheet.absoluteFill}><Artwork category={category}/></View>
    <View style={{ flex: 1, justifyContent: 'space-between', padding: 24 }}>
      <Text style={{ color: colors.accent, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.4 }}>{category}</Text>
      <View style={{ gap: 16 }}><View style={{ height: 4, width: 44, backgroundColor: colors.accent }}/><Text style={{ color: colors.text, fontFamily: fonts.display, fontWeight: '800', fontSize: compact ? 27 : 35, lineHeight: compact ? 32 : 40 }}>{text}</Text></View>
    </View>
  </Animated.View>;
}
