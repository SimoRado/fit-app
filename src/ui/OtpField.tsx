import React, { useRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Text } from './LocalizedText';
import { colors } from './theme';
import { normalizeEmailCode } from '../core/emailCode';

export function OtpField({ value, onChangeText, label = 'Verification code' }: { value: string; onChangeText: (value: string) => void; label?: string }) {
  const ref = useRef<React.ElementRef<typeof TextInput>>(null);
  return <View style={{ gap: 10 }}><Text style={{ color: colors.muted }}>{label}</Text><View style={{ position: 'relative' }}><Pressable accessibilityRole="button" accessibilityLabel="Enter verification code" onPress={() => ref.current?.focus()} style={{ flexDirection: 'row', gap: 6, justifyContent: 'space-between' }}>{Array.from({ length: 6 }, (_, index) => <View key={index} style={{ flex: 1, minWidth: 36, minHeight: 56, borderRadius: 18, borderWidth: 2, borderColor: index === value.length ? colors.accent : colors.borderStrong, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.text, fontSize: 22 }}>{value[index] ?? ''}</Text></View>)}</Pressable><TextInput ref={ref} autoFocus accessibilityLabel={label} value={value} onChangeText={text => onChangeText(normalizeEmailCode(text))} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6} caretHidden selectionColor="transparent" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 56, opacity: 0.01, color: 'transparent' }} /></View></View>;
}
