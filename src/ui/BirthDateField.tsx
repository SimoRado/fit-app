import React, { useRef } from 'react';
import { TextInput, View } from 'react-native';
import { Text } from './LocalizedText';
import { styles } from './components';
import { colors } from './theme';
import { dateParts, updateDatePart } from '../core/birthDate';

export function BirthDateField({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) {
  const month = useRef<React.ElementRef<typeof TextInput>>(null);
  const day = useRef<React.ElementRef<typeof TextInput>>(null);
  const year = useRef<React.ElementRef<typeof TextInput>>(null);
  const parts = dateParts(value);
  function change(part: 'year' | 'month' | 'day', input: string) {
    const previous = parts[part];
    const fullPaste = input.replace(/\D/g, '').length === 8;
    onChangeText(updateDatePart(value, part, input));
    if (fullPaste) return;
    if (part === 'year' && previous.length < 4 && input.replace(/\D/g, '').length === 4) month.current?.focus();
    if (part === 'month' && previous.length < 2 && input.replace(/\D/g, '').length === 2) day.current?.focus();
  }
  const field = (part: 'year' | 'month' | 'day', ref: React.RefObject<React.ElementRef<typeof TextInput> | null>, width: number) => <View key={part} style={{ flex: width, minWidth: 65 }}><Text style={styles.label}>{part.toUpperCase()}</Text><TextInput ref={ref} accessibilityLabel={`Birth ${part}`} style={[styles.input, { textAlign: 'center', paddingHorizontal: 4 }]} value={parts[part]} onChangeText={input => change(part, input)} onKeyPress={({ nativeEvent }) => { if (nativeEvent.key === 'Backspace' && !parts[part]) (part === 'day' ? month : part === 'month' ? year : undefined)?.current?.focus(); }} keyboardType="number-pad" maxLength={part === 'year' ? 10 : 8} autoComplete="birthdate-full" placeholder={part === 'year' ? 'YYYY' : part === 'month' ? 'MM' : 'DD'} placeholderTextColor={colors.subtle}/></View>;
  return <View><Text style={styles.label}>Date of birth</Text><View style={{ flexDirection: 'row', gap: 10 }}>{field('year', year, 2)}{field('month', month, 1)}{field('day', day, 1)}</View></View>;
}
