/**
 * DD / MM / YYYY date entry with automatic focus movement:
 * - typing the last digit of Day moves to Month, Month moves to Year, Year closes the keyboard;
 * - Backspace in an empty field moves back to the previous field;
 * - pasting a whole date into any field fills all three;
 * - the stored value stays `YYYY-MM-DD`.
 */
import React, { useRef, useState } from 'react';
import { Keyboard, TextInput, View, type TextInputKeyPressEvent } from 'react-native';
import { Text } from './LocalizedText';
import { styles } from './components';
import { fonts } from './theme';
import { usePalette } from './voltKit';
import { useApp } from '../state/app';
import { localize } from '../core/i18n';
import { datePartLength, datePartOrder, isoFromParts, joinIsoDate, padDatePart, parsePastedDate, splitIsoDate, typeDatePart, validateDateParts, type DateLimits, type DatePart } from '../core/dateInput';

const placeholders: Record<DatePart, string> = { day: 'DD', month: 'MM', year: 'YYYY' };
const captions: Record<DatePart, string> = { day: 'Day', month: 'Month', year: 'Year' };

export function DateField({ label, value, onChange, limits, autoComplete }: { label: string; value: string; onChange: (iso: string) => void; limits?: DateLimits; autoComplete?: 'birthdate-full' }) {
  const p = usePalette();
  const { language } = useApp();
  const refs = { day: useRef<React.ElementRef<typeof TextInput>>(null), month: useRef<React.ElementRef<typeof TextInput>>(null), year: useRef<React.ElementRef<typeof TextInput>>(null) };
  const [touched, setTouched] = useState(false);
  const parts = splitIsoDate(value);
  const complete = !!(parts.day && parts.month && parts.year.length === 4);
  const error = touched || complete ? validateDateParts(parts, limits) : null;
  const showError = !!error && (touched || complete);

  function change(part: DatePart, input: string) {
    const pasted = input.replace(/\D/g, '').length > datePartLength[part] ? parsePastedDate(input) : null;
    if (pasted) { onChange(joinIsoDate(pasted)); setTouched(true); Keyboard.dismiss(); return; }
    const typed = typeDatePart(part, input);
    onChange(joinIsoDate({ ...parts, [part]: typed.value }));
    if (typed.complete && typed.value.length >= parts[part].length) {
      const next = datePartOrder[datePartOrder.indexOf(part) + 1];
      if (next) refs[next].current?.focus();
      else { setTouched(true); refs.year.current?.blur(); }
    }
  }
  function keyPress(part: DatePart, event: TextInputKeyPressEvent) {
    if (event.nativeEvent.key !== 'Backspace' || parts[part]) return;
    const previous = datePartOrder[datePartOrder.indexOf(part) - 1];
    if (previous) refs[previous].current?.focus();
  }
  function blur(part: DatePart) {
    const padded = padDatePart(part, parts[part]);
    if (padded !== parts[part]) onChange(joinIsoDate({ ...parts, [part]: padded }));
    if (part === 'year' || complete) setTouched(true);
  }

  return <View style={{ gap: 7 }}>
    <Text style={styles.label}>{label}</Text>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {datePartOrder.map(part => <View key={part} style={{ flex: part === 'year' ? 1.5 : 1, minWidth: 0 }}>
        <TextInput ref={refs[part]} accessibilityLabel={`${localize(label, language)}: ${localize(captions[part], language)}`} value={parts[part]} onChangeText={input => change(part, input)}
          onKeyPress={event => keyPress(part, event)} onBlur={() => blur(part)} keyboardType="number-pad" maxLength={10} selectTextOnFocus
          returnKeyType={part === 'year' ? 'done' : 'next'} onSubmitEditing={() => { const next = datePartOrder[datePartOrder.indexOf(part) + 1]; if (next) refs[next].current?.focus(); }}
          autoComplete={autoComplete === 'birthdate-full' ? (part === 'day' ? 'birthdate-day' : part === 'month' ? 'birthdate-month' : 'birthdate-year') : 'off'}
          placeholder={placeholders[part]} placeholderTextColor={p.subtle}
          style={[styles.input, { textAlign: 'center', paddingHorizontal: 4, fontFamily: fonts.displayHeavy, fontSize: 18, borderColor: showError ? p.danger : p.borderStrong }]}/>
        <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.6, textAlign: 'center', marginTop: 4 }}>{localize(captions[part], language).toUpperCase()}</Text>
      </View>)}
    </View>
    {showError && <Text accessibilityRole="alert" style={{ color: p.danger, fontSize: 12.5 }}>{localize(error!, language)}</Text>}
  </View>;
}

/** True when `value` is a complete, valid date within `limits` (for form submission checks). */
export function dateFieldValid(value: string, limits?: DateLimits) { return validateDateParts(splitIsoDate(value), limits) === null && isoFromParts(splitIsoDate(value)) === value; }
