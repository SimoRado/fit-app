import React from 'react';
import { Link } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './LocalizedText';
import { colors, fonts } from './theme';

const linkStyle = { color: colors.accent, fontFamily: fonts.semibold, fontSize: 14, textDecorationLine: 'underline' as const };

export function LegalLinks() {
  return <View style={{ gap: 8 }}>
    <Link href="https://cubyfit.app/terms" accessibilityRole="link" style={linkStyle}>Terms of Use</Link>
    <Link href="https://cubyfit.app/privacy" accessibilityRole="link" style={linkStyle}>Privacy Policy</Link>
    <Link href="https://cubyfit.app/delete-account" accessibilityRole="link" style={linkStyle}>Learn about account deletion</Link>
  </View>;
}

const TERMS_URL = 'https://cubyfit.app/terms';
const PRIVACY_URL = 'https://cubyfit.app/privacy';
const openLegal = (url: string) => { void Linking.openURL(url).catch(() => undefined); };

/**
 * Required acknowledgment (final onboarding step and the re-acceptance screen). The box only
 * enables Continue; acceptance is recorded by the caller through `eligibility.accept` (server:
 * Terms/Privacy versions, timestamp, account) and the local `terms_accepted_version`.
 * It is never consent to optional advertising or analytics.
 */
export function LegalAgreementChoice({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  const inline = { color: colors.accent, fontFamily: fonts.bold, textDecorationLine: 'underline' as const };
  return <View style={{ gap: 10 }}>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel="I have read and agree to the Terms of Use and acknowledge the Privacy Policy" hitSlop={4} onPress={() => onChange(!checked)}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 52, paddingVertical: 4 }}>
      <View style={{ width: 26, height: 26, marginTop: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: checked ? colors.accent : 'transparent', borderWidth: checked ? 0 : 2, borderColor: colors.borderStrong }}>
        {checked && <Ionicons name="checkmark" size={18} color={colors.accentText}/>}
      </View>
      <Text style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, flex: 1 }}>
        I have read and agree to the <Text accessibilityRole="link" onPress={() => openLegal(TERMS_URL)} style={inline}>Terms of Use</Text> and acknowledge the <Text accessibilityRole="link" onPress={() => openLegal(PRIVACY_URL)} style={inline}>Privacy Policy</Text>.
      </Text>
    </Pressable>
    <Text style={{ color: colors.muted, fontSize: 12 }}>Advertising choices are separate and can be changed where available.</Text>
  </View>;
}

export function SignupLegalChoice({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <View style={{ gap: 5 }}>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 44 }}>
      <Text style={{ color: colors.accent, fontSize: 22 }}>{checked ? '☑' : '☐'}</Text>
      <Text style={{ color: colors.text, fontSize: 12.5, flex: 1 }}>I agree to the Terms of Use and acknowledge the Privacy Policy.</Text>
    </Pressable>
    <View style={{ flexDirection: 'row', gap: 18, marginLeft: 30 }}>
      <Link href="https://cubyfit.app/terms" accessibilityRole="link" style={linkStyle}>Terms of Use</Link>
      <Link href="https://cubyfit.app/privacy" accessibilityRole="link" style={linkStyle}>Privacy Policy</Link>
    </View>
  </View>;
}
