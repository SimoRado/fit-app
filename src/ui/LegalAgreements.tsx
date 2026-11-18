import React from 'react';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
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

export function LegalAgreementChoice({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <View style={{ gap: 12 }}>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}>
      <Text style={{ color: colors.accent, fontSize: 25 }}>{checked ? '☑' : '☐'}</Text>
      <Text style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 14, flex: 1 }}>I agree to Cubyfit’s Terms of Use and acknowledge the Privacy Policy.</Text>
    </Pressable>
    <LegalLinks/>
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
