import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Text } from './LocalizedText';
import { Button, styles } from './components';
import { colors, fonts, spacing } from './theme';

export function AuthPage({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: spacing.screen, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32, gap: 18 }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: -90, right: -110, width: 280, height: 280, borderRadius: 140, backgroundColor: colors.lilac, opacity: .5 }}/>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><View style={{ width: 28, height: 28, flexDirection: 'row', flexWrap: 'wrap', borderRadius: 7, overflow: 'hidden' }}>{[colors.sun, colors.coral, colors.accent, colors.mint].map(c => <View key={c} style={{ width: 14, height: 14, backgroundColor: c }}/>)}</View><Text style={{ color: colors.muted, fontFamily: fonts.bold, letterSpacing: .6, fontSize: 11 }}>FITNESS × GROWTH</Text></View>
      <Text accessibilityRole="header" style={{ ...styles.title, fontSize: 44, lineHeight: 45, letterSpacing: -1.8, maxWidth: 330 }}>{title}<Text style={{ color: colors.coral }}>.</Text></Text>
      <Text style={styles.muted}>{detail}</Text>
      <View style={{ gap: 16, marginTop: 12 }}>{children}</View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

export function AuthField({ label, value, onChangeText, secure = false, email = false, code = false }: { label: string; value: string; onChangeText: (value: string) => void; secure?: boolean; email?: boolean; code?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <View><Text style={styles.label}>{label}</Text><View style={{ position: 'relative' }}><TextInput accessibilityLabel={label} style={[styles.input, secure && { paddingRight: 78 }]} value={value} onChangeText={onChangeText} secureTextEntry={secure && !visible} autoCapitalize={email || secure || code ? 'none' : 'sentences'} autoCorrect={false} keyboardType={email ? 'email-address' : code ? 'number-pad' : 'default'} textContentType={secure ? 'password' : email ? 'emailAddress' : code ? 'oneTimeCode' : 'none'} autoComplete={secure ? 'password' : email ? 'email' : code ? 'one-time-code' : 'off'} placeholderTextColor={colors.subtle}/>{secure && <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'View password'} onPress={() => setVisible(value => !value)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, minWidth: 70, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: colors.accent }}>{visible ? 'Hide' : 'View'}</Text></Pressable>}</View></View>;
}

export function AuthAction({ title, onPress, disabled = false }: { title: string; onPress: () => Promise<void> | void; disabled?: boolean }) { return <Button title={title} onPress={onPress} disabled={disabled}/>; }
export function AuthLink({ href, title }: { href: '/(auth)/welcome' | '/(auth)/sign-in' | '/(auth)/sign-up' | '/(auth)/forgot-password'; title: string }) { return <Link href={href} style={{ color: colors.accent, fontFamily: fonts.mono, fontSize: 13, paddingVertical: 10 }}>{title}</Link>; }
export function AuthError({ message }: { message: string }) { return message ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 14 }}>{message}</Text> : null; }
export function clerkMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const item = error as { errors?: { code?: string; longMessage?: string; message?: string }[] };
    const code = item.errors?.[0]?.code ?? '';
    if (/form_identifier_not_found|form_password_incorrect|identifier_not_found/.test(code)) return 'Email or password is incorrect.';
    if (/form_identifier_exists|email_address_exists/.test(code)) return 'This email is already registered. Try signing in.';
    if (/form_code_incorrect/.test(code)) return 'That code is incorrect. Check it and try again.';
    if (/verification_expired|form_code_expired/.test(code)) return 'That code expired. Request a new one.';
    if (/password/.test(code)) return item.errors?.[0]?.longMessage ?? item.errors?.[0]?.message ?? 'Choose a stronger password.';
  }
  return 'Could not complete authentication. Check your connection and try again.';
}
