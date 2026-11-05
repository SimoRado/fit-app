import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Text } from './LocalizedText';
import { Button, styles } from './components';
import { colors, fonts, spacing } from './theme';

export function AuthPage({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: spacing.screen, paddingTop: insets.top + 54, paddingBottom: insets.bottom + 32, gap: 20 }}>
      <Text style={{ color: colors.accent, fontFamily: fonts.mono, letterSpacing: 2, fontSize: 12 }}>BETTER EVERY DAY</Text>
      <Text accessibilityRole="header" style={{ ...styles.title, fontSize: 58, lineHeight: 59 }}>{title}<Text style={{ color: colors.accent }}>.</Text></Text>
      <Text style={styles.muted}>{detail}</Text>
      <View style={{ gap: 16, marginTop: 10 }}>{children}</View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

export function AuthField({ label, value, onChangeText, secure = false, email = false, code = false }: { label: string; value: string; onChangeText: (value: string) => void; secure?: boolean; email?: boolean; code?: boolean }) {
  return <View><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} value={value} onChangeText={onChangeText} secureTextEntry={secure} autoCapitalize={email ? 'none' : 'sentences'} autoCorrect={false} keyboardType={email ? 'email-address' : code ? 'number-pad' : 'default'} textContentType={secure ? 'password' : email ? 'emailAddress' : code ? 'oneTimeCode' : 'none'} autoComplete={secure ? 'password' : email ? 'email' : code ? 'one-time-code' : 'off'} placeholderTextColor={colors.subtle}/></View>;
}

export function AuthAction({ title, onPress, disabled = false }: { title: string; onPress: () => Promise<void> | void; disabled?: boolean }) { return <Button title={title} onPress={onPress} disabled={disabled}/>; }
export function AuthLink({ href, title }: { href: '/(auth)/welcome' | '/(auth)/sign-in' | '/(auth)/sign-up' | '/(auth)/forgot-password'; title: string }) { return <Link href={href} style={{ color: colors.accent, fontFamily: fonts.mono, fontSize: 13, paddingVertical: 10 }}>{title}</Link>; }
export function AuthError({ message }: { message: string }) { return message ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 14 }}>{message}</Text> : null; }
export function clerkMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const item = error as { errors?: { longMessage?: string; message?: string }[] };
    return item.errors?.[0]?.longMessage ?? item.errors?.[0]?.message ?? 'Authentication failed. Please try again.';
  }
  return 'Authentication failed. Check your connection and try again.';
}
