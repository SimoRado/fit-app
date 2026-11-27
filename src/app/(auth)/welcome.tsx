import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { AuthModeSwitch, AuthPage, EmailAuthButton, LanguageButton, OrDivider } from '../../ui/auth';
import { SocialAuth } from '../../ui/SocialAuth';
import { SignupLegalChoice } from '../../ui/LegalAgreements';
import { Text } from '../../ui/LocalizedText';
import { colors } from '../../ui/theme';
import { useVoltTheme } from '../../ui/VoltThemeProvider';
import { View } from 'react-native';
import { AuthMode, authModeMessage, parseAuthMode, authModeRoute, emailActionLabel } from '../../core/authMode';

export default function Welcome() {
  useVoltTheme();
  const params = useLocalSearchParams<{ mode?: string; legal?: string }>();
  const [mode, setMode] = useState<AuthMode>(parseAuthMode(params.mode));
  const [notice, setNotice] = useState('');
  // Convenience gate only: formal Terms/Privacy acceptance (versions, timestamp, age) is recorded
  // server-side at the final onboarding step, so this never counts as consent on its own.
  const [legalAccepted, setLegalAccepted] = useState(params.legal === '1');
  const openEmail = () => {
    if (mode === 'signup' && !legalAccepted) { setNotice('Agree to the Terms of Use before creating an account.'); return; }
    setNotice('');
    router.push({ pathname: authModeRoute(mode), params: legalAccepted ? { legal: '1' } : {} });
  };
  return <AuthPage title={'Grow a little,\nevery day'} detail="Habits, training and progress that adapt to your goals." headerRight={<LanguageButton/>}
    footer={<View style={{ gap: 6 }}>
      <SignupLegalChoice checked={legalAccepted} onChange={setLegalAccepted}/>
      <Text style={{ color: colors.muted, fontSize: 11.5 }}>Cubyfit is for adults aged 18 and older.</Text>
    </View>}>
    <AuthModeSwitch mode={mode} onChange={setMode}/>
    <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 13.5 }}>{authModeMessage(mode)}</Text>
    <SocialAuth legalAccepted={legalAccepted} onLegalChange={setLegalAccepted} showLegal={false}/>
    <OrDivider/>
    <EmailAuthButton title={emailActionLabel(mode)} onPress={openEmail}/>
    {notice ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13, textAlign: 'center' }}>{notice}</Text> : null}
  </AuthPage>;
}
