import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polygon } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getActiveLanguage, localize } from '../core/i18n';
import { colors, fonts, spacing } from './theme';
import { useApp } from '../state/app';
import { useReducedMotion } from './motion';
import { Text } from './LocalizedText';

export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: spacing.base },
  title: { fontSize: 64, lineHeight: 66, fontFamily: fonts.displayHeavy, color: colors.text, textTransform: 'uppercase', includeFontPadding: false },
  subtitle: { fontSize: 28, lineHeight: 30, fontFamily: fonts.displayHeavy, color: colors.text, marginTop: spacing.sm, textTransform: 'uppercase', includeFontPadding: false },
  card: { padding: spacing.card, gap: spacing.md, position: 'relative' },
  text: { color: colors.text, fontSize: 16, lineHeight: 23 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  input: { backgroundColor: colors.card2, borderBottomColor: colors.border, borderBottomWidth: 2, minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 16 },
  label: { color: colors.muted, fontSize: 12, letterSpacing: .7, marginBottom: 5 },
  button: { minHeight: 54, paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  buttonText: { color: colors.accentText, fontFamily: fonts.displayHeavy, fontSize: 19, letterSpacing: 1, textAlign: 'center', textTransform: 'uppercase', includeFontPadding: false },
  ghost: { backgroundColor: 'transparent' }, ghostText: { color: colors.text }, danger: { backgroundColor: 'transparent' },
});

export function AngularBackground({ color = colors.card, border = colors.border, cut = 14 }: { color?: string; border?: string; cut?: number }) {
  const [size, setSize] = useState({ width: 1, height: 1 });
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={event => { const { width, height } = event.nativeEvent.layout; if (width !== size.width || height !== size.height) setSize({ width, height }); }}><Svg width="100%" height="100%" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none">
    <Polygon points={`0,0 ${Math.max(0, size.width - cut)},0 ${size.width},${cut} ${size.width},${size.height} 0,${size.height}`} fill={color} stroke={border} strokeWidth={1}/>
  </Svg></View>;
}

export function Page({ title, children }: { title: string; children: React.ReactNode }) {
  const { language } = useApp();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [reveal] = useState(() => new Animated.Value(0));
  const tabRoute = ['/', '/habits', '/workouts', '/progress', '/profile'].includes(pathname);
  const showBack = !tabRoute && pathname !== '/onboarding';
  const compactHeader = pathname === '/missions';
  const titleSize = language === 'ar' ? 40 : compactHeader ? 30 : tabRoute ? width < 375 ? 58 : 68 : pathname === '/onboarding' ? 64 : title.length > 10 ? 44 : 52;
  useEffect(() => {
    reveal.setValue(reduce ? 1 : 0);
    if (!reduce) Animated.timing(reveal, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [reduce, reveal, pathname]);
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <Animated.View style={{ flex: 1, opacity: reveal.interpolate({ inputRange: [0, 1], outputRange: [.72, 1] }) }}>
      <ScrollView style={styles.page} contentContainerStyle={[styles.content, { paddingHorizontal: width < 375 ? 20 : spacing.screen, paddingTop: insets.top + 18, paddingBottom: Math.max(insets.bottom, 16) + (tabRoute ? 110 : 42), direction: language === 'ar' ? 'rtl' : 'ltr' }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={{ gap: compactHeader ? 8 : 14, flexDirection: compactHeader ? 'row' : 'column', alignItems: compactHeader ? 'center' : 'stretch' }}>
          {showBack && <Pressable accessibilityRole="button" accessibilityLabel={localize('Back', language)} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={{ width: 44, height: 44, borderRadius: compactHeader ? 22 : 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card2 }}>
            <Ionicons name={language === 'ar' ? 'arrow-forward' : 'arrow-back'} size={22} color={colors.text}/>
          </Pressable>}
          {!!title && <Text accessibilityRole="header" style={[styles.title, { fontSize: titleSize, lineHeight: language === 'ar' ? 52 : titleSize + (compactHeader ? 2 : 0), flexShrink: 1 }]}>{title}<Text style={{ color: colors.accent }}>.</Text></Text>}
        </View>
        {children}
      </ScrollView>
    </Animated.View>
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.bg }}/>
    {!reduce && <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, backgroundColor: colors.accent, shadowColor: colors.accent, shadowOpacity: .8, shadowRadius: 14, elevation: 5, opacity: reveal.interpolate({ inputRange: [0, .8, 1], outputRange: [1, 1, 0] }), transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, height] }) }] }}/>}
  </KeyboardAvoidingView>;
}

export function Card({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  const { language } = useApp();
  return <View style={[styles.card, { direction: language === 'ar' ? 'rtl' : 'ltr' }]}><AngularBackground cut={0} border={accent ? colors.accent : colors.border}/>{children}</View>;
}

export function Button({ title, onPress, kind = 'primary', disabled = false, size = 'default' }: { title: string; onPress: () => void | Promise<void>; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; size?: 'default' | 'hero' }) {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [scale] = useState(() => new Animated.Value(1));
  const reduce = useReducedMotion();
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
  const color = kind === 'primary' ? colors.accent : kind === 'danger' ? colors.danger : colors.card2;
  return <Animated.View style={{ flexShrink: 1, transform: [{ scale }] }}>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: inactive }} disabled={inactive} onPress={press}
      onPressIn={() => { if (!reduce) Animated.spring(scale, { toValue: .97, useNativeDriver: true }).start(); }}
      onPressOut={() => { if (!reduce) Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start(); }}
      style={[styles.button, size === 'hero' && { minHeight: 92, paddingHorizontal: 24 }, { direction: language === 'ar' ? 'rtl' : 'ltr', opacity: inactive ? .45 : 1 }]}>
      <AngularBackground color={color} cut={kind === 'primary' ? size === 'hero' ? 30 : 14 : 0} border={kind === 'primary' ? colors.accent : colors.border}/>
      <Text style={[styles.buttonText, size === 'hero' && { fontSize: 34, letterSpacing: 1.6 }, kind !== 'primary' && styles.ghostText]}>{title}</Text>
    </Pressable>
  </Animated.View>;
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
  return <View style={{ gap: 8, direction: language === 'ar' ? 'rtl' : 'ltr' }}><Text style={styles.label}>{label}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{options.map(option => {
      const display = ['7', '30', '90'].includes(option) ? (compact ? option + (language === 'fr' ? ' J' : language === 'ar' ? ' ي' : ' D') : 'Last ' + option + ' days') : option;
      const selected = option === value;
      return <Pressable accessibilityRole="radio" accessibilityLabel={localize(['7', '30', '90'].includes(option) ? 'Last ' + option + ' days' : option, language)} accessibilityState={{ selected }} key={option} onPress={() => onChange(option)} style={{ minHeight: 44, justifyContent: 'center' }}><View style={{ minHeight: pill ? 32 : 44, paddingHorizontal: 14, paddingVertical: pill ? 5 : 10, backgroundColor: selected ? colors.accent : pill ? 'transparent' : colors.card2, borderWidth: pill ? 1 : 0, borderColor: selected ? colors.accent : colors.border, borderRadius: pill ? 20 : 0, justifyContent: 'center' }}><Text style={{ color: selected ? colors.accentText : colors.text, fontWeight: selected ? '700' : '400' }}>{display}</Text></View></Pressable>;
    })}</View>
  </View>;
}
export function MultiChoices<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: readonly T[]; onChange: (x: T[]) => void }) {
  const { language } = useApp();
  return <View style={{ gap: 8, direction: language === 'ar' ? 'rtl' : 'ltr' }}><Text style={styles.label}>{label}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{options.map(option => {
      const selected = value.includes(option);
      return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} key={option} onPress={() => onChange(selected ? value.filter(item => item !== option) : [...value, option])} style={{ minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: selected ? colors.accent : colors.card2, justifyContent: 'center' }}><Text style={{ color: selected ? colors.accentText : colors.text, fontWeight: selected ? '700' : '400' }}>{option}</Text></Pressable>;
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
