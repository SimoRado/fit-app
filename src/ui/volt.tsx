import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radii } from './theme';
import { Text } from './LocalizedText';
import type { Appearance } from './theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

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
