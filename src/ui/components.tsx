import React, { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getActiveLanguage, localize } from '../core/i18n';
import { colors, fonts, spacing, radii, shadows } from './theme';
import { useApp } from '../state/app';
import { Text } from './LocalizedText';
import { useReducedMotion, useTabMotion } from './motion';
import { PageReveal } from './PageReveal';
import { MotionPressable } from './MotionPressable';

export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: spacing.base },
  title: { fontSize: 52, lineHeight: 54, fontFamily: fonts.displayHeavy, color: colors.text, letterSpacing: -1.5, includeFontPadding: false },
  subtitle: { fontSize: 28, lineHeight: 31, fontFamily: fonts.displayHeavy, color: colors.text, marginTop: spacing.sm, letterSpacing: -.5, includeFontPadding: false },
  card: { padding: spacing.card, gap: spacing.md, position: 'relative', borderRadius: radii.card, backgroundColor: colors.card, ...shadows.card },
  text: { color: colors.text, fontSize: 16, lineHeight: 23 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  input: { backgroundColor: colors.card, borderColor: colors.borderStrong, borderWidth: 2, borderRadius: radii.input, minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, color: colors.text, fontFamily: fonts.semibold, fontSize: 16 },
  label: { color: colors.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: .7, textTransform: 'uppercase', marginBottom: 7 },
  button: { minHeight: 56, paddingHorizontal: 22, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', borderRadius: radii.pill },
  buttonText: { color: colors.card, fontFamily: fonts.bold, fontSize: 16, textAlign: 'center', includeFontPadding: false },
  ghost: { backgroundColor: 'transparent' }, ghostText: { color: colors.text }, danger: { backgroundColor: 'transparent' },
});

export function AngularBackground({ color = colors.card, border = colors.border, cut = 14 }: { color?: string; border?: string; cut?: number }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color, borderColor: border, borderWidth: 1, borderRadius: cut >= 30 ? radii.large : radii.card }]}/>;
}

export function Page({ title, children, headerAction }: { title: string; children: React.ReactNode; headerAction?: React.ReactNode }) {
  const { language } = useApp();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const tabRoute = ['/', '/nutrition', '/habits', '/workouts', '/progress', '/profile'].includes(pathname);
  const tabName = pathname === '/' ? 'index' : pathname.slice(1).split('/')[0];
  const { transition } = useTabMotion();
  const reducedMotion = useReducedMotion();
  const revealActive = !reducedMotion && tabRoute && transition.sequence > 0 && transition.route === tabName;
  const showBack = !tabRoute && pathname !== '/onboarding';
  const compactHeader = !tabRoute && pathname !== '/onboarding';
  const inlineHeader = compactHeader || !!headerAction;
  const titleSize = language === 'ar' ? 40 : compactHeader ? 34 : tabRoute ? width < 375 ? 48 : 56 : pathname === '/onboarding' ? 46 : title.length > 10 ? 40 : 48;
  const pageContent = <ScrollView style={styles.page} contentContainerStyle={[styles.content, { paddingHorizontal: width < 375 ? 20 : spacing.screen, paddingTop: insets.top + 18, paddingBottom: Math.max(insets.bottom, 16) + (tabRoute ? 110 : 42), direction: language === 'ar' ? 'rtl' : 'ltr' }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={{ gap: inlineHeader ? 8 : 14, flexDirection: inlineHeader ? 'row' : 'column', alignItems: inlineHeader ? 'center' : 'stretch' }}>
          {showBack && <Pressable accessibilityRole="button" accessibilityLabel={localize('Back', language)} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, ...shadows.card }}>
            <Ionicons name={language === 'ar' ? 'arrow-forward' : 'arrow-back'} size={22} color={colors.text}/>
          </Pressable>}
          {!!title && <Text accessibilityRole="header" style={[styles.title, { fontSize: titleSize, lineHeight: language === 'ar' ? 52 : titleSize + 3, flexShrink: 1 }]}>{title}<Text style={{ color: colors.coral }}>.</Text></Text>}
          {headerAction && <View style={{ marginLeft: 'auto' }}>{headerAction}</View>}
        </View>
        {children}
      </ScrollView>;
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={{ flex: 1 }}>
      {tabRoute ? <PageReveal sequence={revealActive ? transition.sequence : 0}>{pageContent}</PageReveal> : pageContent}
    </View>
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.bg }}/>
  </KeyboardAvoidingView>;
}

export function Card({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  const { language } = useApp();
  return <View style={[styles.card, { direction: language === 'ar' ? 'rtl' : 'ltr', borderWidth: accent ? 2 : 0, borderColor: colors.accent }]}>{children}</View>;
}

export function Button({ title, onPress, kind = 'primary', disabled = false, size = 'default' }: { title: string; onPress: () => void | Promise<void>; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; size?: 'default' | 'hero' }) {
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
  const color = kind === 'primary' ? colors.ink : kind === 'danger' ? colors.coral : colors.card;
  return <View style={{ flexShrink: 1 }}>
    <MotionPressable accessibilityRole="button" accessibilityState={{ disabled: inactive }} disabled={inactive} onPress={press}
      style={[styles.button, size === 'hero' && { minHeight: 92, paddingHorizontal: 24 }, { direction: language === 'ar' ? 'rtl' : 'ltr', opacity: inactive ? .45 : 1 }]}>
      <AngularBackground color={color} border={kind === 'ghost' ? colors.borderStrong : color}/>
      <Text style={[styles.buttonText, size === 'hero' && { fontFamily: fonts.displayHeavy, fontSize: 26 }, kind !== 'primary' && styles.ghostText]}>{title}</Text>
    </MotionPressable>
  </View>;
}

export function Field({ label, value, onChangeText, keyboardType = 'default', placeholder, multiline = false }: { label: string; value: string; onChangeText: (x: string) => void; keyboardType?: 'default' | 'numeric' | 'decimal-pad'; placeholder?: string; multiline?: boolean }) {
  const { language } = useApp();
  return <View style={{ direction: language === 'ar' ? 'rtl' : 'ltr', minWidth: 0 }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={localize(label, language)} style={[styles.input, { textAlign: language === 'ar' ? 'right' : 'left', writingDirection: language === 'ar' ? 'rtl' : 'ltr' }, multiline && { minHeight: 90, textAlignVertical: 'top' }]} value={value} onChangeText={onChangeText} keyboardType={keyboardType === 'numeric' ? 'decimal-pad' : keyboardType} placeholder={placeholder ? localize(placeholder, language) : undefined} placeholderTextColor={colors.subtle} multiline={multiline} returnKeyType={multiline ? 'default' : 'done'} />
  </View>;
}

export function Choices<T extends string>({ label, options, value, onChange, compact = false, pill = false }: { label: string; options: readonly T[]; value: T; onChange: (x: T) => void; compact?: boolean; pill?: boolean }) {
  const { language } = useApp();
  if (compact && options.length === 3 && options.every(option => ['7', '30', '90'].includes(option))) return <View style={{ flexDirection: 'row', backgroundColor: colors.card2, borderRadius: radii.pill, padding: 4, gap: 4 }}>
    {options.map(option => <MotionPressable key={option} selected={option === value} pressScale={0.97} accessibilityRole="radio" accessibilityLabel={localize('Last ' + option + ' days', language)} accessibilityState={{ selected: option === value }} onPress={() => onChange(option)} style={{ flex: 1, minHeight: 42, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: option === value ? colors.card : 'transparent' }}><Text style={{ color: option === value ? colors.ink : colors.muted, fontFamily: fonts.bold, fontSize: 12 }}>{option + (language === 'fr' ? ' J' : language === 'ar' ? ' ي' : 'D')}</Text></MotionPressable>)}
  </View>;
  return <View style={{ gap: 8, direction: language === 'ar' ? 'rtl' : 'ltr' }}><Text style={styles.label}>{label}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{options.map(option => {
      const display = ['7', '30', '90'].includes(option) ? (compact ? option + (language === 'fr' ? ' J' : language === 'ar' ? ' ي' : ' D') : 'Last ' + option + ' days') : option;
      const selected = option === value;
      return <MotionPressable selected={selected} pressScale={0.97} accessibilityRole="radio" accessibilityLabel={localize(['7', '30', '90'].includes(option) ? 'Last ' + option + ' days' : option, language)} accessibilityState={{ selected }} key={option} onPress={() => onChange(option)} style={{ minHeight: 44, justifyContent: 'center' }}><View style={{ minHeight: pill ? 36 : 44, paddingHorizontal: 16, paddingVertical: pill ? 6 : 10, backgroundColor: selected ? colors.ink : colors.card, borderWidth: 1.5, borderColor: selected ? colors.ink : colors.borderStrong, borderRadius: radii.pill, justifyContent: 'center' }}><Text style={{ color: selected ? colors.card : colors.text, fontWeight: selected ? '700' : '600' }}>{display}</Text></View></MotionPressable>;
    })}</View>
  </View>;
}
export function MultiChoices<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: readonly T[]; onChange: (x: T[]) => void }) {
  const { language } = useApp();
  return <View style={{ gap: 8, direction: language === 'ar' ? 'rtl' : 'ltr' }}><Text style={styles.label}>{label}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{options.map(option => {
      const selected = value.includes(option);
      return <MotionPressable selected={selected} pressScale={0.97} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} key={option} onPress={() => onChange(selected ? value.filter(item => item !== option) : [...value, option])} style={{ minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: selected ? colors.ink : colors.card, borderRadius: radii.pill, justifyContent: 'center' }}><Text style={{ color: selected ? colors.card : colors.text, fontWeight: selected ? '700' : '600' }}>{option}</Text></MotionPressable>;
    })}</View>
  </View>;
}
export function Empty({ text = 'Nothing recorded yet' }: { text?: string }) { return <Text style={styles.muted}>{text}</Text>; }
export function confirm(title: string, action: () => void | Promise<void>, body = 'This cannot be undone.', actionLabel = 'Delete') {
  const language = getActiveLanguage();
  Alert.alert(localize(title, language), localize(body, language), [{ text: localize('Cancel', language), style: 'cancel' }, { text: localize(actionLabel, language), style: 'destructive', onPress: () => { try { void Promise.resolve(action()).catch(message); } catch (error) { message(error); } } }]);
}
export function notify(title: string, body: string) { const language = getActiveLanguage(); Alert.alert(localize(title, language), localize(body, language)); }
export function message(error: unknown) { const language = getActiveLanguage(); const issues = error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues); const detail = issues ? 'Please enter valid values in all required fields.' : error instanceof Error ? error.message : String(error); Alert.alert(localize('Please check your entry', language), localize(detail, language)); }
