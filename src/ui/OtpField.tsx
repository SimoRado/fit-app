import React, { useRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Text } from './LocalizedText';
import { colors } from './theme';

export function OtpField({ value, onChangeText, label = 'Verification code' }: { value: string; onChangeText: (value: string) => void; label?: string }) {
  const ref = useRef<React.ElementRef<typeof TextInput>>(null);
  const length = Math.max(6, value.length);
  return <View style={{ gap: 8 }}><Text style={{ color: colors.muted }}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel="Enter verification code" onPress={() => ref.current?.focus()} style={{ flexDirection: 'row', gap: 6, justifyContent: 'space-between' }}>{Array.from({ length }, (_, index) => <View key={index} style={{ flex: 1, minWidth: 36, minHeight: 52, borderWidth: 1, borderColor: index === value.length ? colors.accent : colors.border, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.text, fontSize: 22 }}>{value[index] ?? ''}</Text></View>)}</Pressable><TextInput ref={ref} autoFocus accessibilityLabel={label} value={value} onChangeText={text => onChangeText(text.replace(/\s/g, ''))} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" style={{ height: 1, width: 1, opacity: 0 }} /></View>;
}
