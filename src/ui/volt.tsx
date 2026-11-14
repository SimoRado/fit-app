import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect } from 'react-native-svg';
import { colors, fonts, radii } from './theme';
import { Text } from './LocalizedText';
import type { Appearance } from './theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function VoltProgressRings({ overall, calories, habits, workout }: { overall: number; calories: number | null; habits: number | null; workout: number | null }) {
  const rings = [
    { x: 5, size: 102, radius: 25, value: overall, color: colors.lime },
    { x: 18, size: 76, radius: 20, value: calories ?? 0, color: colors.blue },
    { x: 31, size: 50, radius: 15, value: habits ?? 0, color: colors.paleBlue },
    { x: 43, size: 26, radius: 8, value: workout ?? 0, color: colors.accent },
  ];
  return <Svg width={112} height={112} viewBox="0 0 112 112" accessibilityLabel="Daily progress">
    {rings.map((ring, index) => {
      const length = 4 * (ring.size - 2 * ring.radius) + 2 * Math.PI * ring.radius;
      const progress = Math.max(0, Math.min(1, ring.value));
      return <React.Fragment key={ring.x}>
        <Rect x={ring.x} y={ring.x} width={ring.size} height={ring.size} rx={ring.radius} fill="none" stroke={colors.chartTrack} strokeWidth={index === 0 ? 7 : 6}/>
        {progress > 0 && <Rect x={ring.x} y={ring.x} width={ring.size} height={ring.size} rx={ring.radius} fill="none" stroke={ring.color} strokeWidth={index === 0 ? 7 : 6} strokeDasharray={`${length} ${length}`} strokeDashoffset={length * (1 - progress)} strokeLinecap="round" transform={`rotate(-90 ${ring.x + ring.size / 2} ${ring.x + ring.size / 2})`}/>}
      </React.Fragment>;
    })}
  </Svg>;
}

export function VoltIconTile({ icon, title, onPress }: { icon: IconName; title: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={{ flex: 1, minWidth: 62, minHeight: 76, paddingVertical: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 20 }}>
    <View style={{ width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card2 }}><Ionicons name={icon} size={19} color={colors.accent}/></View>
    <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 10.5 }}>{title}</Text>
  </Pressable>;
}

export function VoltAppearanceSelector({ value, onChange }: { value: Appearance; onChange: (value: Appearance) => void | Promise<void> }) {
  const options: { value: Appearance; title: string; subtitle: string; icon: IconName }[] = [
    { value: 'shore', title: 'Shore', subtitle: 'Light', icon: 'sunny-outline' },
    { value: 'abyss', title: 'Abyss', subtitle: 'OLED dark', icon: 'moon-outline' },
  ];
  return <View style={{ flexDirection: 'row', gap: 10 }}>
    {options.map(option => {
      const selected = value === option.value;
      return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${option.title}, ${option.subtitle}`} onPress={() => { void onChange(option.value); }} style={{ flex: 1, minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: radii.small, backgroundColor: selected ? colors.navActiveBackground : colors.card2, borderWidth: 1, borderColor: selected ? colors.navActiveBackground : colors.border }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.navActiveText : colors.card }}><Ionicons name={option.icon} size={18} color={selected ? colors.navActiveBackground : colors.accent}/></View>
        <View style={{ flex: 1 }}><Text style={{ color: selected ? colors.navActiveText : colors.text, fontFamily: fonts.bold, fontSize: 13 }}>{option.title}</Text><Text style={{ color: selected ? colors.navActiveText : colors.muted, opacity: selected ? .76 : 1, fontSize: 10.5 }}>{option.subtitle}</Text></View>
      </Pressable>;
    })}
  </View>;
}
