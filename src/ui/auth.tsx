import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Text } from './LocalizedText';
import { Button, styles } from './components';
import { colors, fonts, spacing } from './theme';
import { useVoltTheme } from './VoltThemeProvider';
import Svg, { Rect } from 'react-native-svg';
import { CubyMark } from './CubyMark';
import { PageBackground } from './LotusArt';
export { clerkErrorCode, clerkMessage } from '../core/clerkError';

export function AuthPage({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  const { appearance } = useVoltTheme();
  const insets = useSafeAreaInsets();
  const light = appearance === 'shore';
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    {/* Prototype `.auth::before`: the graffiti layer without the top/bottom fade. */}
    <PageBackground fade={false}/>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: spacing.screen, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 32, gap: 12 }}>
      {/* Volt auth backdrop: nested rounded-square arcs in the top-right corner. */}
      <Svg pointerEvents="none" width={220} height={220} viewBox="0 0 220 220" style={{ position: 'absolute', top: -60 + insets.top, right: -70 }}>
        <Rect x={20} y={20} width={260} height={260} rx={64} fill="none" stroke={colors.lime} strokeOpacity={light ? 0.45 : 0.5} strokeWidth={26}/>
        <Rect x={58} y={58} width={190} height={190} rx={44} fill="none" stroke={colors.blue} strokeOpacity={light ? 0.45 : 0.55} strokeWidth={22}/>
      </Svg>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <View style={{ width: 30, height: 30, borderRadius: 9, overflow: 'hidden' }}><CubyMark size={30} variant="brand"/></View>
        <Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 16, letterSpacing: -0.2 }}>Cubyfit</Text>
      </View>
      <Text accessibilityRole="header" style={{ ...styles.title, fontSize: 44, lineHeight: 46, letterSpacing: -1.8, maxWidth: 330, marginTop: 14 }}>{title}<Text style={{ color: colors.titleAccent }}>.</Text></Text>
      <Text style={[styles.muted, { maxWidth: 300 }]}>{detail}</Text>
      <View style={{ gap: 12, marginTop: 12 }}>{children}</View>
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
