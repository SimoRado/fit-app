import React, { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { getActiveLanguage, localize } from '../core/i18n';
import { colors } from './theme';
import { useApp } from '../state/app';
import { Text } from './LocalizedText';

export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg }, content: { padding: 18, paddingBottom: 64, gap: 14 },
  title: { fontSize: 27, fontWeight: '800', color: colors.text }, subtitle: { fontSize: 16, color: colors.muted },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 9 }, text: { color: colors.text, fontSize: 16 }, muted: { color: colors.muted, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  input: { backgroundColor: colors.card2, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 12, color: colors.text, fontSize: 16 },
  label: { color: colors.muted, fontSize: 13, marginBottom: 4 }, button: { backgroundColor: colors.accent, borderRadius: 10, padding: 12, alignItems: 'center' },
  buttonText: { color: '#09130e', fontWeight: '800', fontSize: 15 }, ghost: { backgroundColor: colors.card2 }, ghostText: { color: colors.text }, danger: { backgroundColor: colors.danger },
});

export function Page({ title, children }: { title: string; children: React.ReactNode }) {
  const { language } = useApp();
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={styles.page} contentContainerStyle={[styles.content, { direction: language === 'ar' ? 'rtl' : 'ltr' }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Text style={styles.title}>{title}</Text>{children}
    </ScrollView>
  </KeyboardAvoidingView>;
}
export function Card({ children }: { children: React.ReactNode }) { const { language } = useApp(); return <View style={[styles.card, { direction: language === 'ar' ? 'rtl' : 'ltr' }]}>{children}</View>; }

export function Button({ title, onPress, kind = 'primary', disabled = false }: { title: string; onPress: () => void | Promise<void>; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean }) {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const { language } = useApp();
  function press() {
    if (disabled || pendingRef.current) return;
    try {
      const result = onPress();
      if (result && typeof result.then === 'function') {
        pendingRef.current = true; setPending(true);
        void Promise.resolve(result).catch(message).finally(() => { pendingRef.current = false; setPending(false); });
      }
    } catch (error) { message(error); }
  }
  const inactive = disabled || pending;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: inactive }} disabled={inactive} onPress={press} style={[styles.button, { direction: language === 'ar' ? 'rtl' : 'ltr' }, kind === 'ghost' && styles.ghost, kind === 'danger' && styles.danger, inactive && { opacity: .45 }]}>
    <Text style={[styles.buttonText, kind === 'ghost' && styles.ghostText]}>{title}</Text>
  </Pressable>;
}

export function Field({ label, value, onChangeText, keyboardType = 'default', placeholder, multiline = false }: { label: string; value: string; onChangeText: (x: string) => void; keyboardType?: 'default' | 'numeric' | 'decimal-pad'; placeholder?: string; multiline?: boolean }) {
  const { language } = useApp();
  return <View style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput style={[styles.input, { textAlign: language === 'ar' ? 'right' : 'left', writingDirection: language === 'ar' ? 'rtl' : 'ltr' }, multiline && { minHeight: 70, textAlignVertical: 'top' }]} value={value} onChangeText={onChangeText} keyboardType={keyboardType === 'numeric' ? 'decimal-pad' : keyboardType} placeholder={placeholder ? localize(placeholder, language) : undefined} placeholderTextColor={colors.muted} multiline={multiline} returnKeyType={multiline ? 'default' : 'done'} />
  </View>;
}

export function Choices<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T; onChange: (x: T) => void }) {
  const { language } = useApp();
  return <View style={{ gap: 6, direction: language === 'ar' ? 'rtl' : 'ltr' }}><Text style={styles.label}>{label}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, direction: language === 'ar' ? 'rtl' : 'ltr' }}>{options.map(option => { const display = ['7', '30', '90'].includes(option) ? `Last ${option} days` : option; return <Pressable key={option} onPress={() => onChange(option)} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, backgroundColor: option === value ? colors.accent : colors.card2 }}><Text style={{ color: option === value ? '#09130e' : colors.text }}>{display}</Text></Pressable>; })}</View>
  </View>;
}
export function MultiChoices<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: readonly T[]; onChange: (x: T[]) => void }) {
  const { language } = useApp();
  return <View style={{ gap: 6, direction: language === 'ar' ? 'rtl' : 'ltr' }}><Text style={styles.label}>{label}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, direction: language === 'ar' ? 'rtl' : 'ltr' }}>{options.map(option => { const selected = value.includes(option); return <Pressable key={option} onPress={() => onChange(selected ? value.filter(item => item !== option) : [...value, option])} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, backgroundColor: selected ? colors.accent : colors.card2 }}><Text style={{ color: selected ? '#09130e' : colors.text }}>{option}</Text></Pressable>; })}</View>
  </View>;
}
export function Empty({ text = 'Nothing recorded yet' }: { text?: string }) { return <Text style={styles.muted}>{text}</Text>; }
export function confirm(title: string, action: () => void, body = 'This cannot be undone.', actionLabel = 'Delete') { const language = getActiveLanguage(); Alert.alert(localize(title, language), localize(body, language), [{ text: localize('Cancel', language), style: 'cancel' }, { text: localize(actionLabel, language), style: 'destructive', onPress: action }]); }
export function notify(title: string, body: string) { const language = getActiveLanguage(); Alert.alert(localize(title, language), localize(body, language)); }
export function message(error: unknown) { const language = getActiveLanguage(); const issues = error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues); const detail = issues ? 'Please enter valid values in all required fields.' : error instanceof Error ? error.message : String(error); Alert.alert(localize('Please check your entry', language), localize(detail, language)); }
