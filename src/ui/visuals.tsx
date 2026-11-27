import React from 'react';
import { View } from 'react-native';
import { TapPressable as Pressable } from './MotionPressable';
import { Text } from './LocalizedText';
import { colors, fonts } from './theme';
import { useVoltTheme } from './VoltThemeProvider';

export function SectionHeader({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  // Volt `.secl`: 17px display heading with an accent text action.
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 18, marginBottom: 2, marginHorizontal: 2 }}>
    <Text accessibilityRole="header" style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 17, lineHeight: 22, letterSpacing: -.35, flexShrink: 1, includeFontPadding: false }}>{title}</Text>
    {action && onPress && <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: colors.accent, fontSize: 12.5, fontFamily: fonts.bold }}>{action}</Text></Pressable>}
  </View>;
}

export function ProgressBar({ value }: { value: number }) {
  const { palette } = useVoltTheme();
  const progress = Math.max(0, Math.min(1, value));
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }} style={{ height: 6, borderRadius: 999, backgroundColor: palette.qTrack, overflow: 'hidden' }}>
    <View style={{ height: '100%', width: `${progress * 100}%`, borderRadius: 999, backgroundColor: palette.pgBar }}/>
  </View>;
}

export function Reveal({ children }: { children: React.ReactNode }) {
  return <View>{children}</View>;
}
