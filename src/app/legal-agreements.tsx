import React, { useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../shared/legalVersions';
import { adultAdEligible } from '../services/adAgeEligibility';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { Button, Card, message, Page, styles } from '../ui/components';
import { LegalAgreementChoice } from '../ui/LegalAgreements';
import { Text } from '../ui/LocalizedText';

/** One-time current-Terms acceptance for an existing local adult profile. */
export default function LegalAgreements() {
  const { profile, refresh } = useApp();
  const accept = useMutation(api.eligibility.accept);
  const [checked, setChecked] = useState(false), [busy, setBusy] = useState(false);
  async function continueToApp() {
    if (!checked || !profile || !adultAdEligible(profile.birth_date) || busy) return;
    setBusy(true);
    try {
      await accept({ birthDate: profile.birth_date, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, agreed: true });
      await repo.setPreference('terms_accepted_version', TERMS_VERSION);
      await refresh();
      router.replace('/(tabs)');
    } catch (error) { message(error); }
    finally { setBusy(false); }
  }
  return <Page title="Review our terms">
    <Text style={styles.muted}>Your existing fitness records remain on this device. Please review the current terms before continuing.</Text>
    <Card><LegalAgreementChoice checked={checked} onChange={setChecked}/></Card>
    <Button title={busy ? 'Saving…' : 'Continue'} disabled={!checked || busy} onPress={continueToApp}/>
  </Page>;
}
