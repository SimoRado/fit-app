/**
 * Volt design kit: native equivalents of the shared building blocks used by
 * the Cubyfit Volt prototype (card8, pills, SqRings, Horseshoe, row8, secl,
 * chip8, trio tiles, pg-tabs, seg2). Components read the palette through the
 * theme context so they re-render when Shore/Abyss changes.
 */
import React, { useEffect, useId, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, FadeInDown, interpolate, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { Text } from './LocalizedText';
import { MotionPressable } from './MotionPressable';
import { useReducedMotion } from './motion';
import { easing, fonts, type Palette } from './theme';
import { HORSESHOE, SQUARE_RINGS, horseshoeArc, horseshoeBadge, horseshoeLength, ringFraction, squareRing } from '../core/voltGeometry';
import { useVoltTheme } from './VoltThemeProvider';

export type VoltIcon = React.ComponentProps<typeof Ionicons>['name'];
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);
const outEase = Easing.bezier(...easing.out);

export function usePalette(): Readonly<Palette> { return useVoltTheme().palette; }
export const isLight = (palette: Readonly<Palette>) => palette.bg === '#F5F9FF';

/** Shared entrance used for list rows and hero blocks (prototype `pgIn`). */
export function useEntering(index = 0) {
  const reduced = useReducedMotion();
  return reduced ? undefined : FadeInDown.duration(380).delay(Math.min(index, 8) * 40).withInitialValues({ opacity: 0, transform: [{ translateY: 6 }] });
}

export function cardShadow(palette: Readonly<Palette>): ViewStyle {
  return palette.bg === '#F5F9FF'
    ? { shadowColor: palette.navShadow, shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 1 }
    : {};
}

/** `.card8` — the primary Volt surface. */
export function VCard({ children, style, onPress, accessibilityLabel, tone = 'card' }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string; tone?: 'card' | 'soft1' | 'soft2' }) {
  const p = usePalette();
  const background = tone === 'soft1' ? p.soft1 : tone === 'soft2' ? p.soft2 : p.c8;
  const base: ViewStyle = { backgroundColor: background, borderWidth: 1, borderColor: tone === 'card' ? p.c8Line : 'transparent', borderRadius: 26, padding: 16, ...(tone === 'card' ? cardShadow(p) : {}) };
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
  const light = p.bg === '#F5F9FF';
  return <MotionPressable pressScale={0.88} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} hitSlop={6} onPress={onPress}
    style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1, backgroundColor: accent ? p.g1 : p.c8, borderWidth: !accent && !light ? 1 : 0, borderColor: p.borderStrong, ...(!accent && light ? { shadowColor: p.navShadow, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 } : {}) }}>
    <Ionicons name={icon} size={size * 0.5} color={accent ? p.plInk : p.text}/>
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
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: p.chipBg }}>
    {icon && <Ionicons name={icon} size={12} color={p.chipFg}/>}
    <Text numberOfLines={1} style={{ color: p.chipFg, fontFamily: fonts.bold, fontSize: 11.5 }}>{text}</Text>
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
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: p.g1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="add" size={size * 0.56} color={p.plInk}/></View>;
}

/** Gradient-filled selected surface for pills (`linear-gradient(165deg, g2, g1)`). */
function GradientFill({ from, to, radius }: { from: string; to: string; radius: number }) {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: radius, overflow: 'hidden' }}>
    <Svg width="100%" height="100%"><Defs><LinearGradient id={id} x1="0.35" y1="0" x2="0.65" y2="1"><Stop offset="0" stopColor={from}/><Stop offset="1" stopColor={to}/></LinearGradient></Defs><Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`}/></Svg>
  </View>;
}

export type DayPill = { key: string; number: string; label: string; disabled?: boolean; accessibilityLabel?: string; marker?: React.ReactNode };
/** `.pills` — seven rounded day pills with a gradient selected state. */
export function DayPills({ days, selected, onSelect }: { days: DayPill[]; selected: string; onSelect: (key: string) => void }) {
  const p = usePalette();
  const light = p.bg === '#F5F9FF';
  return <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 5 }}>
    {days.map(day => {
      const on = day.key === selected;
      return <MotionPressable key={day.key} selected={on} pressScale={0.92} accessibilityRole="tab" accessibilityLabel={day.accessibilityLabel} accessibilityState={{ selected: on, disabled: !!day.disabled }} disabled={day.disabled} onPress={() => onSelect(day.key)}
        style={{ flex: 1, minWidth: 0, minHeight: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: on ? p.g1 : p.c8, opacity: day.disabled ? 0.4 : 1,
          ...(on ? { shadowColor: p.g1, shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 } : light ? { shadowColor: p.navShadow, shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 } : { borderWidth: 1, borderColor: p.c8Line }) }}>
        {on && <GradientFill from={p.g2} to={p.g1} radius={999}/>}
        <Text style={{ color: on ? p.plInk : p.text, fontFamily: fonts.displayHeavy, fontSize: 15, lineHeight: 18 }}>{day.number}</Text>
        <Text numberOfLines={1} style={{ color: on ? p.plInk : p.muted, opacity: on ? 0.82 : 1, fontFamily: fonts.semibold, fontSize: 10.5 }}>{day.label}</Text>
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
export function Horseshoe({ value, big, label, width = 240, percentLabel }: { value: number; big: string; label: string; width?: number; percentLabel?: string }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const id = `hs${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const f = Math.max(0, value || 0), clamped = Math.min(1, f);
  const R = HORSESHOE.radius, arc = horseshoeArc, length = horseshoeLength();
  const [bx, by] = horseshoeBadge(clamped);
  const shown = Math.max(0.02, clamped);
  const progress = useSharedValue(reduced ? shown : 0);
  const badge = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    progress.value = reduced ? shown : withTiming(shown, { duration: 1300, easing: outEase });
    badge.value = reduced ? 1 : withDelay(1050, withTiming(1, { duration: 400 }));
  }, [badge, progress, reduced, shown]);
  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - progress.value) }));
  const badgeProps = useAnimatedProps(() => ({ opacity: badge.value }));
  const height = width * 196 / 240;
  return <View style={{ width, height, alignSelf: 'center' }}>
    <Svg width={width} height={height} viewBox="0 0 240 196">
      <Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor={p.g1}/><Stop offset="1" stopColor={p.g2}/></LinearGradient></Defs>
      <Path d={arc(R)} fill="none" stroke={p.hsRim} strokeWidth={36} strokeLinecap="round"/>
      <Path d={arc(R)} fill="none" stroke={p.hsTrack} strokeWidth={27} strokeLinecap="round"/>
      <AnimatedPath d={arc(R)} fill="none" stroke={`url(#${id})`} strokeWidth={25} strokeLinecap="round" strokeDasharray={`${length} ${length}`} animatedProps={arcProps}/>
      <Path d={arc(66)} fill="none" stroke={p.hsDot} strokeWidth={5.5} strokeLinecap="round" strokeDasharray="0 11.5"/>
      <AnimatedG animatedProps={badgeProps}>
        <Circle cx={bx} cy={by} r={21} fill={p.c8} stroke={p.g2} strokeWidth={5.5}/>
        <SvgText x={bx} y={by + 4.4} textAnchor="middle" fill={p.text} fontFamily={fonts.bold} fontSize={12} fontWeight="800">{percentLabel ?? `${Math.round(f * 100)}%`}</SvgText>
      </AnimatedG>
    </Svg>
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: height * 0.25, alignItems: 'center', gap: 2 }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: p.hsIb, marginBottom: 4 }}><Ionicons name="flame" size={18} color={p.hsIc}/></View>
      <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 42, lineHeight: 46, letterSpacing: -1.9 }}>{big}</Text>
      <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 13.5 }}>{label}</Text>
    </View>
  </View>;
}

/** Thin animated bar (`.mbar`, `.pg-hb`, `.pg-gb`). */
export function MiniBar({ value, color, track, height = 6 }: { value: number; color: string; track: string; height?: number }) {
  const reduced = useReducedMotion();
  const target = Math.max(0, Math.min(1, value));
  const progress = useSharedValue(reduced ? target : 0);
  useEffect(() => { progress.value = reduced ? target : withTiming(target, { duration: 900, easing: outEase }); }, [progress, reduced, target]);
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
  const light = p.bg === '#F5F9FF';
  const fills = light ? [p.paleBlue, p.accent, p.softLime] : [p.blue, p.lime, p.blue];
  const inks = light ? [p.text, '#FFFFFF', p.text] : ['#0B1446', '#0B1446', '#0B1446'];
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
export function UnderlineTabs<T extends string>({ options, value, onChange, labels }: { options: readonly T[]; value: T; onChange: (value: T) => void; labels?: Partial<Record<T, string>> }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.indexOf(value));
  const position = useSharedValue(index);
  useEffect(() => { position.value = reduced ? index : withTiming(index, { duration: 350, easing: outEase }); }, [index, position, reduced]);
  const cell = width / Math.max(1, options.length);
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: position.value * cell + cell / 2 - 14 }] }), [cell]);
  return <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} accessibilityRole="tablist" style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: p.border }}>
    {options.map(option => <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: option === value }} onPress={() => onChange(option)} style={{ flex: 1, paddingTop: 10, paddingBottom: 12, alignItems: 'center' }}>
      <Text style={{ color: option === value ? p.text : p.muted, fontFamily: fonts.bold, fontSize: 13.5 }}>{labels?.[option] ?? option}</Text>
    </Pressable>)}
    {width > 0 && <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, bottom: -1, width: 28, height: 2.5, borderRadius: 2, backgroundColor: p.text }, indicator]}/>}
  </View>;
}

/** `.seg2` / 7D-30D-90D — pill segmented control with a sliding thumb. */
export function Segmented<T extends string>({ options, value, onChange, labels, stretch = true }: { options: readonly T[]; value: T; onChange: (value: T) => void; labels?: Partial<Record<T, string>>; stretch?: boolean }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.indexOf(value));
  const position = useSharedValue(index);
  useEffect(() => { position.value = reduced ? index : withTiming(index, { duration: 320, easing: outEase }); }, [index, position, reduced]);
  const cell = (width - 6) / Math.max(1, options.length);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(position.value, [0, Math.max(1, options.length - 1)], [0, cell * Math.max(1, options.length - 1)]) }] }), [cell, options.length]);
  return <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} accessibilityRole="tablist" style={{ flexDirection: 'row', alignSelf: stretch ? 'stretch' : 'flex-start', padding: 3, borderRadius: 999, backgroundColor: p.bg === '#F5F9FF' ? p.soft1 : p.card2 }}>
    {width > 0 && <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 3, top: 3, bottom: 3, width: cell, borderRadius: 999, backgroundColor: p.c8, shadowColor: p.navShadow, shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }, thumb]}/>}
    {options.map(option => <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: option === value }} onPress={() => onChange(option)} style={{ flex: stretch ? 1 : undefined, minHeight: 36, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: option === value ? p.text : p.muted, fontFamily: fonts.bold, fontSize: 12.5 }}>{labels?.[option] ?? option}</Text>
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
