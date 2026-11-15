import React, { useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Text } from './LocalizedText';
import { fonts } from './theme';
import { usePalette } from './voltKit';
import { useReducedMotion } from './motion';
import { wheelIndexes, wheelTime } from '../core/habitDesign';

/**
 * Volt scroll-wheel time picker (reference: native wheel with a ruled centre
 * row and faded neighbours). Built on RN ScrollView snapping + native-driver
 * opacity, so no extra dependency. Value in/out is always "HH:mm".
 */
export const WHEEL_ITEM = 40;
const VISIBLE = 5;
export const WHEEL_HEIGHT = WHEEL_ITEM * VISIBLE;

function Wheel({ items, index, onChange, width, label }: { items: string[]; index: number; onChange: (index: number) => void; width: number; label: string }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const [scrollY] = useState(() => new Animated.Value(index * WHEEL_ITEM));
  const last = useRef(index);
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.max(0, Math.min(items.length - 1, Math.round(event.nativeEvent.contentOffset.y / WHEEL_ITEM)));
    if (next !== last.current) { last.current = next; onChange(next); }
  };
  return <View accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: items[index] }}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    onAccessibilityAction={event => { const next = Math.max(0, Math.min(items.length - 1, index + (event.nativeEvent.actionName === 'increment' ? 1 : -1))); last.current = next; onChange(next); }}
    style={{ width, height: WHEEL_HEIGHT }}>
    <Animated.ScrollView
      nestedScrollEnabled showsVerticalScrollIndicator={false} snapToInterval={WHEEL_ITEM} decelerationRate="fast"
      overScrollMode="never" contentOffset={{ x: 0, y: index * WHEEL_ITEM }}
      contentContainerStyle={{ paddingVertical: WHEEL_ITEM * 2 }}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      scrollEventThrottle={16} onMomentumScrollEnd={settle}
      onScrollEndDrag={event => { if (Platform.OS === 'ios' || !event.nativeEvent.velocity?.y) settle(event); }}>
      {items.map((item, position) => {
        const range = [(position - 2) * WHEEL_ITEM, (position - 1) * WHEEL_ITEM, position * WHEEL_ITEM, (position + 1) * WHEEL_ITEM, (position + 2) * WHEEL_ITEM];
        const opacity = reduced ? (position === index ? 1 : 0.35) : scrollY.interpolate({ inputRange: range, outputRange: [0.18, 0.42, 1, 0.42, 0.18], extrapolate: 'clamp' });
        const scale = reduced ? 1 : scrollY.interpolate({ inputRange: range, outputRange: [0.86, 0.93, 1, 0.93, 0.86], extrapolate: 'clamp' });
        return <Animated.View key={item} style={{ height: WHEEL_ITEM, alignItems: 'center', justifyContent: 'center', opacity, transform: [{ scale }] }}>
          <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 22, fontVariant: ['tabular-nums'] }}>{item}</Text>
        </Animated.View>;
      })}
    </Animated.ScrollView>
  </View>;
}

const pad = (value: number) => String(value).padStart(2, '0');
const HOURS_12 = Array.from({ length: 12 }, (_, i) => pad(i + 1));
const HOURS_24 = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));

export function WheelTimePicker({ value, hour12, onConfirm, onCancel }: { value: string; hour12: boolean; onConfirm: (time: string) => void; onCancel: () => void }) {
  const p = usePalette();
  const initial = wheelIndexes(value, hour12);
  const [hourIndex, setHourIndex] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [period, setPeriod] = useState(initial.period);
  const result = useMemo(() => wheelTime(hourIndex, minute, period, hour12), [hour12, hourIndex, minute, period]);
  return <View style={{ borderRadius: 24, backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line, paddingTop: 10, paddingHorizontal: 14, paddingBottom: 12, shadowColor: '#0B1446', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 }}>
    <View style={{ height: WHEEL_HEIGHT, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
      {/* Ruled centre row */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: WHEEL_ITEM * 2, height: WHEEL_ITEM, borderTopWidth: 1, borderBottomWidth: 1, borderColor: p.borderStrong }}/>
      <Wheel label="Hour" items={hour12 ? HOURS_12 : HOURS_24} index={hourIndex} onChange={setHourIndex} width={64}/>
      <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 22, marginHorizontal: 2 }}>:</Text>
      <Wheel label="Minute" items={MINUTES} index={minute} onChange={setMinute} width={64}/>
      {hour12 && <Wheel label="AM or PM" items={['AM', 'PM']} index={period} onChange={setPeriod} width={64}/>}
    </View>
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
      <Pressable accessibilityRole="button" onPress={onCancel} style={{ flex: 1, minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.borderStrong }}>
        <Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 14 }}>Cancel</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Set time ${result}`} onPress={() => onConfirm(result)} style={{ flex: 1, minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: p.text }}>
        <Text style={{ color: p.bg, fontFamily: fonts.bold, fontSize: 14 }}>Set time</Text>
      </Pressable>
    </View>
  </View>;
}

/** Device clock preference: 12 h unless the locale formats hours as 24 h. */
export function deviceUses12h() {
  try { return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 !== false; } catch { return true; }
}
