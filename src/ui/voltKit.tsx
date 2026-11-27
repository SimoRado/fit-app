/**
 * Volt design kit: native equivalents of the shared building blocks used by
 * the Cubyfit Volt prototype (card8, pills, SqRings, Horseshoe, row8, secl,
 * chip8, trio tiles, pg-tabs, seg2). Components read the palette through the
 * theme context so they re-render when Shore/Abyss changes.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleProp, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, FadeInDown, interpolate, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Text } from './LocalizedText';
import { MotionPressable, TapPressable as Pressable } from './MotionPressable';
import { useReducedMotion } from './motion';
import { MOTION } from '../core/pressMotion';
import { easing, fonts, type Palette, brand } from './theme';
import { HORSESHOE, SQUARE_RINGS, horseshoeArc, horseshoeLength, ringFraction, squareRing } from '../core/voltGeometry';
import { useVoltTheme } from './VoltThemeProvider';
import { candyStyle, linearGradient } from './LotusArt';

export type VoltIcon = React.ComponentProps<typeof Ionicons>['name'];
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const outEase = Easing.bezier(...easing.out);

export function usePalette(): Readonly<Palette> { return useVoltTheme().palette; }
export const isLight = (palette: Readonly<Palette>) => palette.light;

/** Shared entrance used for list rows and hero blocks (prototype `pgIn`). */
export function useEntering(index = 0) {
  const reduced = useReducedMotion();
  return reduced ? undefined : FadeInDown.duration(380).delay(Math.min(index, 8) * 40).withInitialValues({ opacity: 0, transform: [{ translateY: 6 }] });
}

export function cardShadow(palette: Readonly<Palette>): ViewStyle {
  // Volt (original): bordered card with a faint navy shadow on Shore, flat on the dark appearances.
  if (palette.style === 'volt') return palette.light ? { boxShadow: '0px 6px 14px rgba(11,20,70,0.05)' } : {};
  return palette.light
    // Lotus `.card8`: borderless with a soft violet drop shadow; Abyss gets a faint violet wash.
    ? { boxShadow: '0px 1px 2px rgba(73,16,139,0.04), 0px 12px 30px -14px rgba(73,16,139,0.16)' }
    : { backgroundImage: 'linear-gradient(160deg, rgba(126,48,225,0.10), transparent 60%)' };
}

/** `.card8` — the primary Volt surface. */
export function VCard({ children, style, onPress, accessibilityLabel, tone = 'card', raised = false }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string; tone?: 'card' | 'soft1' | 'soft2'; raised?: boolean }) {
  const p = usePalette();
  const background = tone === 'soft1' ? p.soft1 : tone === 'soft2' ? p.soft2 : p.c8;
  const base: ViewStyle = { backgroundColor: background, borderWidth: 1, borderColor: tone === 'card' && (!p.light || p.style === 'volt') ? p.c8Line : 'transparent', borderRadius: 26, padding: 16, ...(tone === 'card' ? cardShadow(p) : raised ? { boxShadow: '0px 4px 14px -6px rgba(73,16,139,0.14)' } : {}) };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return <MotionPressable pressScale={0.97} accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={[base, style]}>{children}</MotionPressable>;
}

/** `.top` row: small uppercase eyebrow and a trailing action. */
export function ScreenTop({ label, right }: { label?: string; right?: React.ReactNode }) {
  const p = usePalette();
  return <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
    <Text numberOfLines={1} style={{ flex: 1, color: p.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label ?? ''}</Text>
    {right ? <View style={{ flexDirection: 'row', gap: 8 }}>{right}</View> : null}
  </View>;
}

/** `.page-t` — the large display title with the accent full stop. */
export function PageTitle({ title, size = 41 }: { title: string; size?: number }) {
  const p = usePalette();
  return <Text accessibilityRole="header" style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: size, lineHeight: Math.round(size * 1.08), letterSpacing: -size * 0.03, includeFontPadding: false, marginBottom: 10 }}>{title}<Text style={{ color: p.titleAccent }}>.</Text></Text>;
}

/** `.ic` (plain) and `.ic.acc` / `.addb` (accent) circular buttons. */
export function CircleButton({ icon, onPress, label, tone = 'plain', size = 36, disabled }: { icon: VoltIcon; onPress: () => void; label: string; tone?: 'plain' | 'accent'; size?: number; disabled?: boolean }) {
  const p = usePalette();
  const accent = tone === 'accent';
  const light = p.light;
  return <MotionPressable pressScale={0.88} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} hitSlop={6} onPress={onPress}
    style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1, backgroundColor: accent ? undefined : p.c8, borderWidth: !accent && !light ? 1 : 0, borderColor: p.borderStrong, ...(accent ? candyStyle(p) : light ? { boxShadow: '0px 2px 10px rgba(42,9,80,0.12)' } : {}) }}>
    <Ionicons name={icon} size={size * 0.5} color={accent ? p.candyInk : p.text}/>
  </MotionPressable>;
}

/** `.ib` — rounded icon box. */
export function IconBox({ icon, size = 36, radius = 12, background, color, iconSize }: { icon: VoltIcon; size?: number; radius?: number; background?: string; color?: string; iconSize?: number }) {
  const p = usePalette();
  return <View style={{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center', backgroundColor: background ?? p.c8 }}><Ionicons name={icon} size={iconSize ?? Math.round(size * 0.5)} color={color ?? p.accent}/></View>;
}

/** `.chip8` — soft lime pill (streaks, counters). */
export function VChip({ icon, text }: { icon?: VoltIcon; text: string }) {
  const p = usePalette();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundImage: linearGradient(135, p.chipStops) }}>
    {icon && <Ionicons name={icon} size={12} color={p.chipInk}/>}
    <Text numberOfLines={1} style={{ color: p.chipInk, fontFamily: fonts.bold, fontSize: 11.5 }}>{text}</Text>
  </View>;
}

/** `.secl` — section header with an optional "See all" action. */
export function SectionLink({ title, action, onPress, right }: { title: string; action?: string; onPress?: () => void; right?: React.ReactNode }) {
  const p = usePalette();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 2, marginHorizontal: 2, gap: 10 }}>
    <Text accessibilityRole="header" style={{ flexShrink: 1, color: p.text, fontFamily: fonts.displayHeavy, fontSize: 17, letterSpacing: -0.35 }}>{title}</Text>
    {right ?? (action && onPress ? <Pressable accessibilityRole="button" onPress={onPress} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32 }}><Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 12.5 }}>{action}</Text><Ionicons name="chevron-forward" size={14} color={p.accent}/></Pressable> : null)}
  </View>;
}

/** `.row8` — list row card. */
export function ListRow({ icon, iconBackground, iconColor, title, subtitle, right, onPress, accessibilityLabel, index = 0, muted = false }: { icon?: VoltIcon; iconBackground?: string; iconColor?: string; title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void; accessibilityLabel?: string; index?: number; muted?: boolean }) {
  const p = usePalette();
  const entering = useEntering(index);
  const body = <>
    {icon && <IconBox icon={icon} background={iconBackground ?? p.soft1} color={iconColor}/>}
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Text numberOfLines={1} style={{ color: muted ? p.muted : p.text, fontFamily: fonts.displayHeavy, fontSize: 14 }}>{title}</Text>
      {!!subtitle && <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12 }}>{subtitle}</Text>}
    </View>
    {right}
  </>;
  const style: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, minHeight: 60, borderRadius: 20, backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line };
  return <Animated.View entering={entering}>
    {onPress ? <MotionPressable pressScale={0.98} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} onPress={onPress} style={style}>{body}</MotionPressable> : <View style={style}>{body}</View>}
  </Animated.View>;
}

/** Trailing kcal-style value used by `.kc8`. */
export function RowValue({ value, unit }: { value: string; unit?: string }) {
  const p = usePalette();
  return <View style={{ alignItems: 'flex-end' }}><Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 18, lineHeight: 20 }}>{value}</Text>{!!unit && <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 10, marginTop: 1 }}>{unit}</Text>}</View>;
}

/** `.plus8` — small accent circle with a plus. */
export function PlusDot({ size = 30 }: { size?: number }) {
  const p = usePalette();
  return <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', ...candyStyle(p) }}><Ionicons name="add" size={size * 0.56} color={p.candyInk}/></View>;
}

export type DayPill = { key: string; number: string; label: string; disabled?: boolean; accessibilityLabel?: string; marker?: React.ReactNode; today?: boolean };
/** `.pills` — seven rounded day pills with a gradient selected state. */
export function DayPills({ days, selected, onSelect }: { days: DayPill[]; selected: string; onSelect: (key: string) => void }) {
  const p = usePalette();
  const light = p.light;
  return <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 5 }}>
    {days.map(day => {
      const on = day.key === selected;
      return <MotionPressable key={day.key} selected={on} pressScale={0.92} accessibilityRole="tab" accessibilityLabel={day.accessibilityLabel} accessibilityState={{ selected: on, disabled: !!day.disabled }} disabled={day.disabled} onPress={() => onSelect(day.key)}
        style={{ flex: 1, minWidth: 0, minHeight: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: on ? undefined : p.c8, opacity: day.disabled ? 0.4 : 1,
          ...(on ? { backgroundImage: linearGradient(p.pillAngle, p.pill), boxShadow: p.style === 'lotus' ? `0px 8px 20px -6px ${p.candyGlow}` : `0px 5px 10px ${p.plGlow}` } : light ? { boxShadow: '0px 1px 2px rgba(73,16,139,0.04), 0px 6px 14px -8px rgba(73,16,139,0.16)' } : { borderWidth: 1, borderColor: p.c8Line }),
          ...(!on && day.today ? { borderWidth: 1.5, borderColor: p.accent } : {}) }}>
        <Text style={{ color: on ? p.candyInk : day.today ? p.accent : p.text, fontFamily: fonts.displayHeavy, fontSize: 15, lineHeight: 18 }}>{day.number}</Text>
        <Text numberOfLines={1} style={{ color: on ? p.candyInk : p.muted, opacity: on ? 0.9 : 1, fontFamily: fonts.semibold, fontSize: 10.5 }}>{day.label}</Text>
        {day.marker}
      </MotionPressable>;
    })}
  </View>;
}

function SquareRing({ index, value, color, track, reduced }: { index: number; value: number; color: string; track: string; reduced: boolean }) {
  const { offset: o, width: w, radius: rx, length } = squareRing(index);
  const sw = SQUARE_RINGS.stroke;
  const target = ringFraction(value);
  const progress = useSharedValue(reduced ? target : 0);
  useEffect(() => {
    progress.value = reduced ? target : withDelay(index * 120, withTiming(target, { duration: 1200, easing: outEase }));
  }, [index, progress, reduced, target]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - progress.value) }));
  return <G>
    <Rect x={o} y={o} width={w} height={w} rx={rx} fill="none" stroke={track} strokeWidth={sw}/>
    <AnimatedRect x={o} y={o} width={w} height={w} rx={rx} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${length} ${length}`} animatedProps={animatedProps}/>
  </G>;
}

/** `SqRings` — Cubyfit's nested rounded-square progress graphic (calories, habits, workout). */
export function SquareRings({ values, size = 128, accessibilityLabel }: { values: number[]; size?: number; accessibilityLabel?: string }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const colorsForRing = [p.q1, p.q2, p.q3];
  return <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ width: size, height: size }}>
    <Svg width={size} height={size} viewBox="0 0 136 136">
      {values.slice(0, 3).map((value, index) => <SquareRing key={index} index={index} value={value} color={colorsForRing[index]} track={p.qTrack} reduced={reduced}/>)}
    </Svg>
  </View>;
}

/** `Horseshoe` — 240° calorie gauge with dotted inner rail and a moving percent badge. */
/** Number that tweens to `value` (JS-side, re-renders only itself). Ends exactly on `value`. */
export function CountUp({ value, format, duration = 700 }: { value: number; format: (value: number) => string; duration?: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    if (reduced || !Number.isFinite(value)) { current.current = value; setShown(value); return; }
    const from = current.current;
    if (from === value) return;
    const started = Date.now();
    let frame = 0;
    const step = () => {
      const k = Math.min(1, (Date.now() - started) / duration);
      const next = from + (value - from) * (1 - Math.pow(1 - k, 3));
      current.current = k >= 1 ? value : next;
      setShown(current.current);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    // A newer value cancels this tween and continues from wherever it got to.
    return () => cancelAnimationFrame(frame);
  }, [value, reduced, duration]);
  return <>{format(shown)}</>;
}

export function Horseshoe({ value, big, label, width = 240, percentLabel, duration = 1300 }: { value: number; big: React.ReactNode; label: string; width?: number; percentLabel?: string; duration?: number }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const id = `hs${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const f = Math.max(0, value || 0), clamped = Math.min(1, f);
  const R = HORSESHOE.radius, arc = horseshoeArc, length = horseshoeLength();
  const shown = Math.max(0.02, clamped);
  const progress = useSharedValue(reduced ? shown : 0);
  const badge = useSharedValue(reduced ? 1 : 0);
  // The ring always continues from where it is (date switches, edits); it never resets to zero.
  useEffect(() => { progress.value = reduced ? shown : withTiming(shown, { duration, easing: outEase }); }, [progress, reduced, shown, duration]);
  useEffect(() => { badge.value = reduced ? 1 : withDelay(Math.min(1050, duration), withTiming(1, { duration: 400 })); }, [badge, reduced, duration]);
  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - progress.value) }));
  const height = width * 196 / 240;
  const scale = width / 240, size = 47.5 * scale;
  const { cx, cy, start, end } = HORSESHOE;
  // The % badge rides the end of the arc on the UI thread.
  const badgeStyle = useAnimatedStyle(() => {
    const angle = start - (start - end) * progress.value;
    return { opacity: badge.value, transform: [{ translateX: (cx + R * Math.cos(angle)) * scale - size / 2 }, { translateY: (cy - R * Math.sin(angle)) * scale - size / 2 }] };
  });
  return <View style={{ width, height, alignSelf: 'center' }}>
    <Svg width={width} height={height} viewBox="0 0 240 196">
      <Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor={p.g1}/><Stop offset="1" stopColor={p.g2}/></LinearGradient></Defs>
      <Path d={arc(R)} fill="none" stroke={p.hsRim} strokeWidth={36} strokeLinecap="round"/>
      <Path d={arc(R)} fill="none" stroke={p.hsTrack} strokeWidth={27} strokeLinecap="round"/>
      <AnimatedPath d={arc(R)} fill="none" stroke={`url(#${id})`} strokeWidth={25} strokeLinecap="round" strokeDasharray={`${length} ${length}`} animatedProps={arcProps}/>
      <Path d={arc(66)} fill="none" stroke={p.hsDot} strokeWidth={5.5} strokeLinecap="round" strokeDasharray="0 11.5"/>
    </Svg>
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: p.c8, borderWidth: 5.5 * scale, borderColor: p.g2 }, badgeStyle]}>
      <Text numberOfLines={1} style={{ color: p.text, fontFamily: fonts.bold, fontSize: 12 * scale, includeFontPadding: false }}>{percentLabel ?? <CountUp value={Math.round(f * 100)} duration={duration} format={next => `${Math.round(next)}%`}/>}</Text>
    </Animated.View>
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: height * 0.25, alignItems: 'center', gap: 2 }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: p.hsIb, marginBottom: 4 }}><Ionicons name="flame" size={18} color={p.hsIc}/></View>
      <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 42, lineHeight: 46, letterSpacing: -1.9 }}>{big}</Text>
      <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 13.5 }}>{label}</Text>
    </View>
  </View>;
}

/** Thin animated bar (`.mbar`, `.pg-hb`, `.pg-gb`). */
export function MiniBar({ value, color, track, height = 6, duration = 900 }: { value: number; color: string; track: string; height?: number; duration?: number }) {
  const reduced = useReducedMotion();
  const target = Math.max(0, Math.min(1, value));
  const progress = useSharedValue(reduced ? target : 0);
  useEffect(() => { progress.value = reduced ? target : withTiming(target, { duration, easing: outEase }); }, [progress, reduced, target, duration]);
  const style = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}><Animated.View style={[{ height: '100%', borderRadius: height / 2, backgroundColor: color }, style]}/></View>;
}

/** Big hero number with a superscript unit (`.qr-n`, `.pg-big`). */
export function HeroNumber({ value, sup, size = 40, supColor }: { value: string; sup?: string; size?: number; supColor?: string }) {
  const p = usePalette();
  return <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
    <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: size, lineHeight: Math.round(size * 1.05), letterSpacing: -size * 0.05, includeFontPadding: false }}>{value}</Text>
    {!!sup && <Text style={{ color: supColor ?? p.accent, fontFamily: fonts.displayHeavy, fontSize: Math.max(14, size * 0.36), marginLeft: 1, marginTop: size * 0.02 }}>{sup}</Text>}
  </View>;
}

export type TrioItem = { label: string; value: string; unit?: string };
/** `.trio` — three colored stat tiles (lilac / accent / mint). */
export function StatTrio({ items }: { items: TrioItem[] }) {
  const p = usePalette();
  const light = p.light;
  const fills = light ? [p.paleBlue, p.accent, p.softLime] : [p.blue, p.lime, p.blue];
  const inks = light ? [p.text, '#FFFFFF', p.text] : [brand.ink, brand.ink, brand.ink];
  return <View style={{ flexDirection: 'row', gap: 8 }}>
    {items.slice(0, 3).map((item, index) => <View key={item.label} style={{ flex: 1, minWidth: 0, borderRadius: 19, paddingVertical: 14, paddingHorizontal: 14, backgroundColor: fills[index] }}>
      <Text numberOfLines={1} style={{ color: inks[index], opacity: 0.75, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase' }}>{item.label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 8 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1, color: inks[index], fontFamily: fonts.displayHeavy, fontSize: 22, lineHeight: 24 }}>{item.value}</Text>
        {!!item.unit && <Text style={{ color: inks[index], fontFamily: fonts.bold, fontSize: 11, marginLeft: 2 }}>{item.unit}</Text>}
      </View>
    </View>)}
  </View>;
}

/** `.pg-tabs` — evenly spaced text tabs with a sliding short underline. */
export function UnderlineTabs<T extends string>({ options, value, onChange, labels, icons, hints }: { options: readonly T[]; value: T; onChange: (value: T) => void; labels?: Partial<Record<T, string>>; /** Optional small trailing icon per option (e.g. a Pro lock). */ icons?: Partial<Record<T, VoltIcon>>; hints?: Partial<Record<T, string>> }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.indexOf(value));
  const position = useSharedValue(index);
  useEffect(() => { position.value = reduced ? index : withTiming(index, { duration: 350, easing: outEase }); }, [index, position, reduced]);
  const cell = width / Math.max(1, options.length);
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: position.value * cell + cell / 2 - 14 }] }), [cell]);
  return <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} accessibilityRole="tablist" style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: p.border }}>
    {options.map(option => <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: option === value }} accessibilityHint={hints?.[option]} onPress={() => onChange(option)} style={{ flex: 1, paddingTop: 10, paddingBottom: 12, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: option === value ? p.text : p.muted, fontFamily: fonts.bold, fontSize: 13.5 }}>{labels?.[option] ?? option}</Text>
      {!!icons?.[option] && <Ionicons name={icons[option]} size={12} color={option === value ? p.text : p.muted}/>}
    </Pressable>)}
    {width > 0 && <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, bottom: -1, width: 28, height: 2.5, borderRadius: 2, backgroundColor: p.text }, indicator]}/>}
  </View>;
}

/** `.seg2` / 7D-30D-90D — pill segmented control with a sliding thumb. */
export function Segmented<T extends string>({ options, value, onChange, labels, stretch = true, icons, hints }: { options: readonly T[]; value: T; onChange: (value: T) => void; labels?: Partial<Record<T, string>>; stretch?: boolean; /** Optional small trailing icon per option (e.g. a Pro lock). */ icons?: Partial<Record<T, VoltIcon>>; /** Optional accessibility hint per option. */ hints?: Partial<Record<T, string>> }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.indexOf(value));
  const position = useSharedValue(index);
  useEffect(() => { position.value = reduced ? index : withTiming(index, { duration: MOTION.segment, easing: outEase }); }, [index, position, reduced]);
  const cell = (width - 8) / Math.max(1, options.length);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(position.value, [0, Math.max(1, options.length - 1)], [0, cell * Math.max(1, options.length - 1)]) }] }), [cell, options.length]);
  return <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} accessibilityRole="tablist" style={{ flexDirection: 'row', alignSelf: stretch ? 'stretch' : 'flex-start', padding: 4, borderRadius: 999, backgroundColor: p.light ? p.soft1 : p.card2 }}>
    {width > 0 && <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 4, top: 4, bottom: 4, width: cell, borderRadius: 999, backgroundColor: p.light ? p.c8 : p.elevated, boxShadow: p.light ? '0px 2px 8px rgba(42,9,80,0.14)' : undefined }, thumb]}/>}
    {options.map(option => <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: option === value }} accessibilityHint={hints?.[option]} onPress={() => onChange(option)} style={{ flex: stretch ? 1 : undefined, minHeight: 34, paddingHorizontal: 14, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: option === value ? p.text : p.muted, fontFamily: fonts.bold, fontSize: 11.5, letterSpacing: 0.23 }}>{labels?.[option] ?? option}</Text>
      {!!icons?.[option] && <Ionicons name={icons[option]} size={11} color={option === value ? p.text : p.muted}/>}
    </Pressable>)}
  </View>;
}

/** `.emp` — dashed empty-state call to action. */
export function EmptyAction({ text, icon = 'add', onPress }: { text: string; icon?: VoltIcon; onPress?: () => void }) {
  const p = usePalette();
  const style: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: p.borderStrong };
  const content = <><Ionicons name={icon} size={18} color={p.muted}/><Text style={{ flex: 1, color: p.muted, fontFamily: fonts.semibold, fontSize: 13 }}>{text}</Text></>;
  return onPress ? <MotionPressable pressScale={0.98} accessibilityRole="button" onPress={onPress} style={style}>{content}</MotionPressable> : <View style={[style, { borderStyle: 'solid', borderColor: p.border }]}>{content}</View>;
}

/** `.pg-kpis` — three hairline-separated KPIs. */
export function KpiRow({ items }: { items: { value: string; label: string }[] }) {
  const p = usePalette();
  return <View style={{ flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: p.border }}>
    {items.map((item, index) => <View key={item.label} style={{ flex: 1, minWidth: 0, gap: 4, paddingVertical: 14, paddingLeft: index ? 14 : 0, borderLeftWidth: index ? 1 : 0, borderLeftColor: p.border }}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 20, lineHeight: 22 }}>{item.value}</Text>
      <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 11.5 }}>{item.label}</Text>
    </View>)}
  </View>;
}

/** Action-menu row (prototype `.am-b`). */
export function MenuItem({ icon, label, onPress, disabled, danger }: { icon: VoltIcon; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const p = usePalette();
  return <MotionPressable pressScale={0.97} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: isLight(p) ? p.soft1 : p.card2, opacity: disabled ? 0.4 : 1 }}>
    <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? p.g1 : p.c8 }}><Ionicons name={icon} size={18} color={danger ? p.plInk : p.text}/></View>
    <Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 15 }}>{label}</Text>
  </MotionPressable>;
}
