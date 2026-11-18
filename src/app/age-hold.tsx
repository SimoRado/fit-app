import React from 'react';
import { useAuth } from '@clerk/expo';
import { Link, router } from 'expo-router';
import { Button, Card, message, Page, styles } from '../ui/components';
import { Text } from '../ui/LocalizedText';
import { colors, fonts } from '../ui/theme';

export default function AgeHold() {
  const { signOut } = useAuth();
  return <Page title="Age eligibility"><Card>
    <Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 23 }}>Cubyfit is for adults aged 18 and older.</Text>
    <Text style={styles.muted}>You’re not eligible to create a Cubyfit account at this time. Your existing account and records, if any, have not been deleted.</Text>
    <Text style={styles.muted}>If your date of birth is incorrect, contact <Link href="mailto:privacy@cubyfit.app" accessibilityRole="link" style={{ color: colors.accent, textDecorationLine: 'underline' }}>privacy@cubyfit.app</Link>.</Text>
    <Button title="Delete account" kind="ghost" onPress={() => router.push('/delete-account')}/>
    <Button title="Return to welcome" onPress={() => { void signOut().then(() => router.replace('/(auth)/welcome')).catch(message); }}/>
  </Card></Page>;
}
