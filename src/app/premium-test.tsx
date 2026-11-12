import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@clerk/expo';
import type { PurchasesPackage } from 'react-native-purchases';
import { subscriptionPackages } from '../services/subscriptionLogic';
import { useSubscription } from '../state/subscriptions';
import { Button, Card, Page, styles } from '../ui/components';
import { Text } from '../ui/LocalizedText';
import { colors, fonts } from '../ui/theme';
import { sendDevelopmentTestEvent } from '../core/monitoring';

export default function PremiumTest() {
  const { userId } = useAuth();
  const subscription = useSubscription();
  const [selection, setSelection] = useState<'weekly' | 'monthly'>('monthly');
  const [notice, setNotice] = useState<string | null>(null);
  const plans = subscriptionPackages(subscription.offering);
  const chosen = plans[selection];
  async function subscribe() {
    if (!chosen || !userId) return;
    setNotice(null);
    try {
      const result = await subscription.purchase(chosen);
      setNotice(result === 'cancelled' ? 'Purchase cancelled. No subscription was activated.' : 'Purchase completed. Check the entitlement status below.');
    } catch { /* The provider exposes the RevenueCat error below. */ }
  }
  async function restore() {
    setNotice(null);
    try { await subscription.restore(); setNotice('Restore finished. Current entitlement status is shown below.'); }
    catch { /* The provider exposes the RevenueCat error below. */ }
  }
  return <Page title="Fitapp Premium">
    <Text style={styles.text}>Unlock your full potential.</Text>
    <Text style={{ color: colors.accent, fontFamily: fonts.mono, fontSize: 11 }}>{__DEV__ ? 'REVENUECAT TEST STORE · DEVELOPMENT ONLY' : 'REVENUECAT · PREMIUM'}</Text>
    {!subscription.ready && <Card><Text style={styles.muted}>{subscription.loading ? 'Connecting to RevenueCat…' : subscription.error ?? 'Preparing subscriptions…'}</Text></Card>}
    {!subscription.ready && !subscription.loading && <Button title="Retry connection" kind="ghost" onPress={subscription.refresh}/>}
    {subscription.ready && <>
      <Text style={styles.muted}>Offering: {subscription.offering?.identifier ?? 'No current Offering configured'}</Text>
      {(['weekly', 'monthly'] as const).map(period => {
        const item: PurchasesPackage | null = plans[period];
        const selected = selection === period;
        return <Pressable key={period} accessibilityRole="radio" accessibilityState={{ selected, disabled: !item }} disabled={!item || subscription.busy} onPress={() => setSelection(period)} style={{ padding: 18, gap: 7, backgroundColor: colors.card, borderWidth: 2, borderColor: selected ? colors.accent : colors.border, opacity: item ? 1 : .6 }}>
          <Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 23 }}>{period === 'weekly' ? 'Weekly subscription' : 'Monthly subscription'}</Text>
          <Text style={styles.text}>{item?.product.priceString ?? 'Not configured in current Offering'}</Text>
          <Text style={styles.muted}>Billed {period === 'weekly' ? 'weekly' : 'monthly'}{item ? ` · ${item.identifier}` : ''}</Text>
        </Pressable>;
      })}
      <Button title={subscription.busy ? 'Processing…' : subscription.isPremium ? 'Premium active' : 'Continue / Subscribe'} onPress={subscribe} disabled={!chosen || subscription.busy || subscription.activeIds.length > 0 || subscription.loading}/>
      <Button title="Restore Purchases" kind="ghost" onPress={restore} disabled={subscription.busy || subscription.loading}/>
      <Button title="Refresh status and plans" kind="ghost" onPress={async () => { try { await subscription.refresh(); } catch { /* Error appears below. */ } }} disabled={subscription.busy || subscription.loading}/>
      <Card><Text style={styles.label}>Subscription Status</Text><Text style={styles.text}>{subscription.isPremium ? 'PREMIUM ACTIVE' : subscription.activeIds.length ? 'ENTITLEMENT ACTIVE · ID UNVERIFIED' : 'FREE'}</Text><Text style={styles.muted}>Active entitlement: {subscription.activeIds.join(', ') || 'none'}</Text>{!subscription.entitlementId && <Text style={styles.muted}>Premium entitlement ID has not been verified in the dashboard. Showing active RevenueCat entitlements.</Text>}</Card>
    </>}
    {!!subscription.error && subscription.ready && <Text style={{ color: colors.danger }}>{subscription.error} Status may be cached until RevenueCat reconnects.</Text>}
    {!!notice && <Text style={styles.muted}>{notice}</Text>}
    {__DEV__ && <Button title="Send handled Sentry test event" kind="ghost" onPress={() => setNotice(sendDevelopmentTestEvent() ? 'Test event sent. Check the development Sentry project.' : 'Configure the Sentry DSN first.')}/>}
    <Button title="Close / Back" kind="ghost" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')}/>
  </Page>;
}
