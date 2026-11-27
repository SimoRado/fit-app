import React, { useEffect, useState } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from './motion';
import { KeyboardAvoidingView, LayoutChangeEvent, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { BottomSheet } from './BottomSheet';
import { AuthMode, languageOptions, languageShortCode } from '../core/authMode';
import { Text } from './LocalizedText';
import { Button, styles } from './components';
import { colors, fonts, spacing } from './theme';
import { useVoltTheme } from './VoltThemeProvider';
import Svg, { Rect } from 'react-native-svg';
import { CubyMark } from './CubyMark';
import { PageBackground, candyStyle } from './LotusArt';
export { clerkErrorCode, clerkMessage } from '../core/clerkError';

export function AuthPage({ title, detail, children, headerRight, footer, onBack }: { title: string; detail: string; children: React.ReactNode; headerRight?: React.ReactNode; footer?: React.ReactNode; onBack?: () => void }) {
  const { appearance } = useVoltTheme();
  const { language } = useApp();
  const insets = useSafeAreaInsets();
  const light = appearance === 'shore';
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    {/* Prototype `.auth::before`: the graffiti layer without the top/bottom fade. */}
    <PageBackground fade={false}/>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: spacing.screen, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 20, gap: 12, direction: language === 'ar' ? 'rtl' : 'ltr' }}>
      {/* Volt auth backdrop: nested rounded-square arcs in the top-right corner. */}
      <Svg pointerEvents="none" width={220} height={220} viewBox="0 0 220 220" style={{ position: 'absolute', top: -60 + insets.top, right: -70 }}>
        <Rect x={20} y={20} width={260} height={260} rx={64} fill="none" stroke={colors.lime} strokeOpacity={light ? 0.45 : 0.5} strokeWidth={26}/>
        <Rect x={58} y={58} width={190} height={190} rx={44} fill="none" stroke={colors.blue} strokeOpacity={light ? 0.45 : 0.55} strokeWidth={22}/>
      </Svg>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        {onBack && <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={6} onPress={onBack} style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.c8, transform: [{ scale: pressed ? 0.94 : 1 }], ...(colors.light ? { boxShadow: '0px 2px 10px rgba(11,20,70,0.12)' } : { borderWidth: 1, borderColor: colors.borderStrong }) })}><Ionicons name={language === 'ar' ? 'arrow-forward' : 'arrow-back'} size={18} color={colors.text}/></Pressable>}
        <View style={{ width: 30, height: 30, borderRadius: 9, overflow: 'hidden' }}><CubyMark size={30} variant="brand"/></View>
        <Text style={{ flex: 1, color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 16, letterSpacing: -0.2 }}>Cubyfit</Text>
        {headerRight}
      </View>
      <Text accessibilityRole="header" style={{ ...styles.title, fontSize: 44, lineHeight: 46, letterSpacing: -1.8, maxWidth: 330, marginTop: 14 }}>{title}<Text style={{ color: colors.titleAccent }}>.</Text></Text>
      <Text style={[styles.muted, { maxWidth: 300 }]}>{detail}</Text>
      <View style={{ gap: 12, marginTop: 12 }}>{children}</View>
      {footer ? <View style={{ marginTop: 'auto', paddingTop: 12 }}>{footer}</View> : null}
    </ScrollView>
  </KeyboardAvoidingView>;
}

export function AuthField({ label, value, onChangeText, secure = false, email = false, code = false }: { label: string; value: string; onChangeText: (value: string) => void; secure?: boolean; email?: boolean; code?: boolean }) {
  useVoltTheme();
  const [visible, setVisible] = useState(false);
  return <View><Text style={styles.label}>{label}</Text><View style={{ position: 'relative' }}><TextInput accessibilityLabel={label} style={[styles.input, secure && { paddingRight: 78 }]} value={value} onChangeText={onChangeText} secureTextEntry={secure && !visible} autoCapitalize={email || secure || code ? 'none' : 'sentences'} autoCorrect={false} keyboardType={email ? 'email-address' : code ? 'number-pad' : 'default'} textContentType={secure ? 'password' : email ? 'emailAddress' : code ? 'oneTimeCode' : 'none'} autoComplete={secure ? 'password' : email ? 'email' : code ? 'one-time-code' : 'off'} placeholderTextColor={colors.subtle}/>{secure && <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'View password'} onPress={() => setVisible(value => !value)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, minWidth: 70, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: colors.accent }}>{visible ? 'Hide' : 'View'}</Text></Pressable>}</View></View>;
}

export function AuthAction({ title, onPress, disabled = false }: { title: string; onPress: () => Promise<void> | void; disabled?: boolean }) { return <Button title={title} onPress={onPress} disabled={disabled}/>; }
export function AuthLink({ href, title }: { href: '/(auth)/welcome' | '/(auth)/sign-in' | '/(auth)/sign-up' | '/(auth)/forgot-password'; title: string }) { useVoltTheme(); return <Link href={href} style={{ color: colors.accent, fontFamily: fonts.bold, fontSize: 13, paddingVertical: 10, textAlign: 'center' }}>{title}</Link>; }
export function AuthError({ message }: { message: string }) { useVoltTheme(); return message ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 14 }}>{message}</Text> : null; }
// Clerk API errors carry `errors[0].code`; other ClerkErrors (including some
// returned by the signIn.password()/signUp future API) carry `code` directly.

/** Small rounded language chip (EN + chevron) that opens the shared bottom sheet with the three supported languages. */
export function LanguageButton() {
  useVoltTheme();
  const { language, setLanguage } = useApp();
  const [open, setOpen] = useState(false);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Select language" accessibilityHint={languageOptions.find(option => option.code === language)?.label} hitSlop={6} onPress={() => setOpen(true)}
      style={({ pressed }) => ({ minWidth: 58, height: 36, paddingHorizontal: 12, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: colors.c8, transform: [{ scale: pressed ? 0.96 : 1 }], ...(colors.light ? { boxShadow: '0px 2px 10px rgba(11,20,70,0.10)' } : { borderWidth: 1, borderColor: colors.borderStrong }) })}>
      <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 13, letterSpacing: 0.6 }}>{languageShortCode(language)}</Text>
      <Ionicons name="chevron-down" size={14} color={colors.muted}/>
    </Pressable>
    <BottomSheet visible={open} title="Select language" onClose={() => setOpen(false)}>
      {close => <View style={{ gap: 8, paddingHorizontal: 20, paddingBottom: 12 }}>
        {languageOptions.map(option => {
          const selected = option.code === language;
          return <Pressable key={option.code} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={option.label} onPress={() => { setLanguage(option.code); close(); }}
            style={{ minHeight: 56, paddingHorizontal: 16, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: selected ? colors.soft1 : colors.c8, borderWidth: 1.5, borderColor: selected ? colors.accent : colors.c8Line }}>
            <Text style={{ flex: 1, color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}>{option.label}</Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.6 }}>{option.short}</Text>
            <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>{selected && <Ionicons name="checkmark-circle" size={22} color={colors.accent}/>}</View>
          </Pressable>;
        })}
      </View>}
    </BottomSheet>
  </>;
}

/** Sign up / Log in segmented control: the selected pill is the raised surface on a soft track. */
export function AuthModeSwitch({ mode, onChange }: { mode: AuthMode; onChange: (mode: AuthMode) => void }) {
  useVoltTheme();
  const { language } = useApp();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = mode === 'login' ? 1 : 0;
  // Same slide as the shared voltKit `Segmented` thumb (320 ms ease-out); instant with reduced motion.
  const position = useSharedValue(index);
  useEffect(() => { position.value = reduced ? index : withTiming(index, { duration: 320, easing: Easing.out(Easing.cubic) }); }, [index, position, reduced]);
  const cell = Math.max(0, (width - 8) / 2);
  const direction = language === 'ar' ? -1 : 1;
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: position.value * cell * direction }] }), [cell, direction]);
  return <View accessibilityRole="tablist" onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: colors.light ? colors.soft1 : colors.card2 }}>
    {width > 0 && <Animated.View pointerEvents="none" style={[{ position: 'absolute', start: 4, top: 4, bottom: 4, width: cell, borderRadius: 999, backgroundColor: colors.c8, ...(colors.light ? { boxShadow: '0px 4px 12px rgba(11,20,70,0.14)' } : { borderWidth: 1, borderColor: colors.borderStrong }) }, thumb]}/>}
    {(['signup', 'login'] as const).map(value => {
      const selected = mode === value;
      return <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(value)}
        style={{ flex: 1, minHeight: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: selected ? colors.text : colors.muted, fontFamily: fonts.bold, fontSize: 14.5 }}>{value === 'signup' ? 'Sign up' : 'Log in'}</Text>
      </Pressable>;
    })}
  </View>;
}

/** Dedicated email entry point: the theme's primary pill with an envelope icon. */
export function EmailAuthButton({ title, onPress }: { title: string; onPress: () => void }) {
  useVoltTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 56, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0px 10px 22px -8px ' + colors.candyGlow, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 999 }, candyStyle(colors, 'none')]}/>
    <Ionicons name="mail-outline" size={19} color={colors.candyInk}/>
    <Text style={{ color: colors.candyInk, fontFamily: fonts.bold, fontSize: 15.5 }}>{title}</Text>
  </Pressable>;
}

export function OrDivider() {
  useVoltTheme();
  return <View accessible={false} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    <View style={{ flex: 1, height: 1, backgroundColor: colors.borderStrong }}/><Text style={{ color: colors.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.2 }}>OR</Text><View style={{ flex: 1, height: 1, backgroundColor: colors.borderStrong }}/>
  </View>;
}

/** The email Clerk reports for this sign-up (never sample data) with its verified state. */
export function AccountEmailCard({ email }: { email: string }) {
  useVoltTheme();
  if (!email) return null;
  const ok = colors.light ? '#0E8A5F' : '#5BE3A8';
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 22, backgroundColor: colors.c8, borderWidth: 1, borderColor: colors.c8Line }}>
    <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.light ? colors.paleBlue : colors.soft1 }}><Text style={{ color: colors.accent, fontFamily: fonts.displayHeavy, fontSize: 16 }}>{email.charAt(0).toUpperCase()}</Text></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 14 }}>{email}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="shield-checkmark-outline" size={13} color={ok}/><Text style={{ color: ok, fontFamily: fonts.semibold, fontSize: 12 }}>Email verified</Text></View>
    </View>
  </View>;
}
