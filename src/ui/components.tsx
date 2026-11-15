import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getActiveLanguage, localize } from '../core/i18n';
import { storageErrorMessage } from '../core/errors';
import { colors, fonts, spacing, radii, shadows } from './theme';
import { useApp } from '../state/app';
import { Text } from './LocalizedText';
import { useReducedMotion, useTabMotion } from './motion';
import { PageReveal } from './PageReveal';
import { MotionPressable } from './MotionPressable';

export const styles = {
  get page() { return { flex: 1 as const, backgroundColor: colors.bg }; },
  content: { width: '100%' as const, maxWidth: 620, alignSelf: 'center' as const, gap: spacing.md },
  get title() { return { fontSize: 41, lineHeight: 45, fontFamily: fonts.displayHeavy, color: colors.text, letterSpacing: -1.2, includeFontPadding: false as const }; },
  get subtitle() { return { fontSize: 17, lineHeight: 22, fontFamily: fonts.displayHeavy, color: colors.text, marginTop: spacing.sm, letterSpacing: -.35 }; },
  get card() { return { padding: spacing.card, gap: spacing.md, position: 'relative' as const, borderRadius: radii.card, backgroundColor: colors.c8, borderWidth: 1, borderColor: colors.c8Line, ...(colors.bg === '#F5F9FF' ? shadows.card : {}) }; },
  get text() { return { color: colors.text, fontSize: 16, lineHeight: 23 }; },
  get muted() { return { color: colors.muted, fontSize: 14, lineHeight: 21 }; },
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 10 },
  get input() { return { backgroundColor: colors.card, borderColor: colors.borderStrong, borderWidth: 1.5, borderRadius: radii.input, minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, color: colors.text, fontFamily: fonts.semibold, fontSize: 16 }; },
  get label() { return { color: colors.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: .77, textTransform: 'uppercase' as const, marginBottom: 7 }; },
  button: { minHeight: 50, paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center' as const, justifyContent: 'center' as const, position: 'relative' as const, overflow: 'hidden' as const, borderRadius: radii.pill },
  get buttonText() { return { color: colors.accentText, fontFamily: fonts.bold, fontSize: 15, textAlign: 'center' as const, includeFontPadding: false as const }; },
  ghost: { backgroundColor: 'transparent' },
  get ghostText() { return { color: colors.text }; },
  danger: { backgroundColor: 'transparent' },
};

export function AngularBackground({ color = colors.card, border = colors.border, cut = 14 }: { color?: string; border?: string; cut?: number }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color, borderColor: border, borderWidth: 1, borderRadius: cut >= 30 ? radii.large : radii.card }]}/>;
}

export function Page({ title, children, headerAction, eyebrow, headerContent, footer, onBack }: { title: string; children: React.ReactNode; headerAction?: React.ReactNode; eyebrow?: string; headerContent?: React.ReactNode; footer?: React.ReactNode; onBack?: () => void }) {
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
  // Volt prototype: tab screens use a 44px `.top` row (eyebrow + actions) above a 41px
  // `.page-t` title; secondary screens use a back circle with an inline 22px `.bar-t` title.
  const titleSize = language === 'ar' ? 34 : compactHeader ? 22.4 : pathname === '/onboarding' ? 34 : width < 360 ? 36 : 41;
  const back = showBack && <MotionPressable pressScale={0.9} accessibilityRole="button" accessibilityLabel={localize('Back', language)} hitSlop={6} onPress={() => onBack ? onBack() : router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.c8, ...(colors.bg === '#F5F9FF' ? { shadowColor: colors.navShadow, shadowOpacity: .12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 } : { borderWidth: 1, borderColor: colors.borderStrong }) }}>
    <Ionicons name={language === 'ar' ? 'chevron-forward' : 'chevron-back'} size={18} color={colors.text}/>
  </MotionPressable>;
  const titleNode = !!title && <Text accessibilityRole="header" style={[styles.title, { fontSize: titleSize, lineHeight: language === 'ar' ? titleSize + 14 : Math.round(titleSize * 1.1), letterSpacing: -titleSize * .03, flexShrink: 1 }]}>{title}<Text style={{ color: colors.titleAccent }}>.</Text></Text>;
  const header = compactHeader
    ? <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 }}>{back}<View style={{ flex: 1, minWidth: 0 }}>{headerContent ?? titleNode}</View>{headerAction}</View>
    : <View>
      {(eyebrow !== undefined || headerAction) && <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text numberOfLines={1} style={{ flex: 1, color: colors.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: .8, textTransform: 'uppercase' }}>{eyebrow ?? ''}</Text>
        {headerAction && <View style={{ flexDirection: 'row', gap: 8 }}>{headerAction}</View>}
      </View>}
      {titleNode}
    </View>;
  const pageContent = <ScrollView style={styles.page} automaticallyAdjustKeyboardInsets contentContainerStyle={[styles.content, { paddingHorizontal: spacing.screen, paddingTop: insets.top + 4, paddingBottom: Math.max(insets.bottom, 16) + (tabRoute ? 96 : footer ? 104 : 42), direction: language === 'ar' ? 'rtl' : 'ltr' }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {(!!title || showBack || headerAction || headerContent) && header}
        {children}
      </ScrollView>;
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={{ flex: 1 }}>
      {tabRoute ? <PageReveal sequence={revealActive ? transition.sequence : 0}>{pageContent}</PageReveal> : pageContent}
    </View>
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.bg }}/>
    {/* Prototype `.dock`: sticky bottom actions above the system navigation area. */}
    {footer && <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      <View pointerEvents="none" style={{ height: 22, opacity: 0.9 }}><View style={{ flex: 1, backgroundColor: colors.bg, opacity: 0.35 }}/></View>
      <View style={{ width: '100%', maxWidth: 620, alignSelf: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: spacing.screen, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) + 4, backgroundColor: colors.bg, direction: language === 'ar' ? 'rtl' : 'ltr' }}>{footer}</View>
    </View>}
  </KeyboardAvoidingView>;
}

export function Card({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  const { language } = useApp();
  return <View style={[styles.card, { direction: language === 'ar' ? 'rtl' : 'ltr', borderWidth: accent ? 2 : 1, borderColor: accent ? colors.g1 : colors.c8Line }]}>{children}</View>;
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
  // Volt: primary actions use the gradient-anchor colour (navy on Shore, lime on Abyss).
  const color = kind === 'primary' ? colors.g1 : kind === 'danger' ? colors.danger : colors.c8;
  const textColor = kind === 'primary' ? colors.plInk : kind === 'danger' ? colors.dangerText : colors.text;
  return <View style={{ flexShrink: 1 }}>
    <MotionPressable accessibilityRole="button" accessibilityState={{ disabled: inactive }} disabled={inactive} onPress={press}
      style={[styles.button, size === 'hero' && { minHeight: 58, paddingHorizontal: 24 }, { direction: language === 'ar' ? 'rtl' : 'ltr', opacity: disabled ? .45 : pending ? .8 : 1 }]}>
      <AngularBackground color={color} border={kind === 'ghost' ? colors.borderStrong : color}/>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {pending && <ActivityIndicator size="small" color={textColor}/>}
        <Text style={[styles.buttonText, { color: textColor }, size === 'hero' && { fontFamily: fonts.displayHeavy, fontSize: 17 }]}>{title}</Text>
      </View>
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
      return <MotionPressable selected={selected} pressScale={0.97} accessibilityRole="radio" accessibilityLabel={localize(['7', '30', '90'].includes(option) ? 'Last ' + option + ' days' : option, language)} accessibilityState={{ selected }} key={option} onPress={() => onChange(option)} style={{ minHeight: 44, justifyContent: 'center' }}><View style={{ minHeight: pill ? 36 : 44, paddingHorizontal: 16, paddingVertical: pill ? 6 : 10, backgroundColor: selected ? colors.accent : colors.card, borderWidth: 1.5, borderColor: selected ? colors.accent : colors.borderStrong, borderRadius: radii.pill, justifyContent: 'center' }}><Text style={{ color: selected ? colors.accentText : colors.text, fontWeight: selected ? '700' : '600' }}>{display}</Text></View></MotionPressable>;
    })}</View>
  </View>;
}
export function MultiChoices<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: readonly T[]; onChange: (x: T[]) => void }) {
  const { language } = useApp();
  return <View style={{ gap: 8, direction: language === 'ar' ? 'rtl' : 'ltr' }}><Text style={styles.label}>{label}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{options.map(option => {
      const selected = value.includes(option);
      return <MotionPressable selected={selected} pressScale={0.97} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} key={option} onPress={() => onChange(selected ? value.filter(item => item !== option) : [...value, option])} style={{ minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: selected ? colors.accent : colors.card, borderRadius: radii.pill, justifyContent: 'center' }}><Text style={{ color: selected ? colors.accentText : colors.text, fontWeight: selected ? '700' : '600' }}>{option}</Text></MotionPressable>;
    })}</View>
  </View>;
}
export function Empty({ text = 'Nothing recorded yet' }: { text?: string }) { return <Text style={styles.muted}>{text}</Text>; }
export function confirm(title: string, action: () => void | Promise<void>, body = 'This cannot be undone.', actionLabel = 'Delete') {
  const language = getActiveLanguage();
  Alert.alert(localize(title, language), localize(body, language), [{ text: localize('Cancel', language), style: 'cancel' }, { text: localize(actionLabel, language), style: 'destructive', onPress: () => { try { void Promise.resolve(action()).catch(message); } catch (error) { message(error); } } }]);
}
export function notify(title: string, body: string) { const language = getActiveLanguage(); Alert.alert(localize(title, language), localize(body, language)); }
export function message(error: unknown) { const language = getActiveLanguage(); const issues = error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues); const detail = issues ? 'Please enter valid values in all required fields.' : storageErrorMessage(error); Alert.alert(localize('Please check your entry', language), localize(detail, language)); }
