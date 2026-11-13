import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Platform, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { runtimeSignals } from '../core/runtime';
import { useSubscription } from '../state/subscriptions';
import { adEligibility } from '../services/adEligibility';
import { admobTestingEnabled, interstitialManager } from '../services/adMob';
import { buildAdDiagnosticReport } from '../services/adDiagnosticReport';
import { Button, Card, Page, message, notify, styles } from '../ui/components';
import { Text } from '../ui/LocalizedText';
import { SectionHeader } from '../ui/visuals';
import { colors } from '../ui/theme';

function displayTime(value: number | null) {
  return value === null ? 'Not yet' : new Date(value).toLocaleString();
}

function elapsed(value: number | null, now: number) {
  if (value === null) return 'Not yet';
  const seconds = Math.max(0, Math.floor((now - value) / 1000));
  if (seconds < 60) return `${seconds} seconds ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  return `${Math.floor(seconds / 3600)} hours ago`;
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start' }}>
    <Text style={[styles.muted, { flex: 1 }]}>{label}</Text>
    <Text style={{ color: colors.text, fontWeight: '700', flex: 1, textAlign: 'right' }}>{value}</Text>
  </View>;
}

export default function AdMobTestingScreen() {
  const snapshot = useSyncExternalStore(interstitialManager.subscribe, interstitialManager.getSnapshot, interstitialManager.getSnapshot);
  const subscription = useSubscription();
  const [now, setNow] = useState(0);
  const [working, setWorking] = useState(false);
  const runtime = runtimeSignals();
  const eligibility = adEligibility({
    ready: subscription.ready,
    loading: subscription.loading,
    busy: subscription.busy,
    activeEntitlementCount: Object.keys(subscription.info?.entitlements.active ?? {}).length,
  });
  const diagnostics = interstitialManager.getDiagnostics();
  const tickNow = now || diagnostics.now;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!admobTestingEnabled) router.replace('/(tabs)/profile');
  }, []);

  async function refreshDiagnostics() {
    setWorking(true);
    try {
      await Promise.all([interstitialManager.refreshDiagnostics(), subscription.refresh()]);
    } catch (error) {
      message(error);
    } finally {
      setWorking(false);
    }
  }

  async function copyReport() {
    try {
      const fresh = interstitialManager.getDiagnostics();
      const report = buildAdDiagnosticReport({
        buildType: __DEV__ ? (runtime.kind === 'expo-go' ? 'Expo Go development' : 'Native development') : admobTestingEnabled ? 'Standalone internal preview' : 'Standalone release',
        platform: Platform.OS,
        runtime: {
          kind: runtime.kind,
          executionEnvironment: runtime.executionEnvironment,
          appOwnership: runtime.appOwnership,
          hasExpoGoConfig: runtime.hasExpoGoConfig,
          expoVersionPresent: Boolean(runtime.expoVersion),
          appIdMatches: runtime.appIdMatches,
        },
        testingEnabled: admobTestingEnabled,
        diagnostics: { ...fresh, eligibility },
      });
      await Clipboard.setStringAsync(report, { android: { isSensitive: true } });
      notify('Diagnostic report copied', 'The report excludes account details, credentials and advertising identifiers.');
    } catch {
      message(new Error('Could not copy the diagnostic report.'));
    }
  }

  if (!admobTestingEnabled) return null;

  const currentBuildType = __DEV__
    ? runtime.kind === 'expo-go' ? 'Expo Go development' : 'Native development'
    : 'Standalone internal preview';
  const nativeText = snapshot.nativeAvailable === null ? 'Not checked' : snapshot.nativeAvailable ? 'Available' : 'Missing';
  const consentText = snapshot.consentStatus === 'permitted' ? 'Requests permitted' : snapshot.consentStatus === 'denied' ? 'Requests not permitted' : snapshot.consentStatus === 'checking' ? 'Checking' : snapshot.consentStatus === 'unavailable' ? 'Unavailable' : 'Not checked';
  const consentFormText = snapshot.consentFormAvailable === null ? 'Not checked' : snapshot.consentFormAvailable ? 'Available' : 'Unavailable';
  const premiumText = eligibility === 'premium' ? 'Premium active' : eligibility === 'free' ? 'Free' : 'Unresolved';
  const automaticSuppressionReason = eligibility === 'premium' ? 'Premium entitlement is active'
    : eligibility === 'unresolved' ? 'Subscription status is unresolved'
      : !diagnostics.foreground ? 'App is not in the foreground'
        : !diagnostics.safeScreen ? 'Current screen is not an automatic ad placement'
          : snapshot.nativeAvailable === false ? 'Native AdMob module is missing'
            : !snapshot.canRequestAds ? 'UMP does not currently permit ad requests'
              : !snapshot.initialized ? 'AdMob SDK is not initialized'
                : diagnostics.nextEligibleAt > tickNow ? 'Automatic frequency limit is active'
                  : !snapshot.ready ? 'No interstitial is currently loaded' : 'None';
  const automaticEligibleNow = automaticSuppressionReason === 'None';
  const manualStatus = !diagnostics.testControlsEnabled ? 'Internal build or official test unit unavailable'
    : eligibility === 'premium' ? 'Suppressed while Premium is active'
      : eligibility !== 'free' ? 'Waiting for confirmed Free entitlement'
        : snapshot.consentInfoStatus === 'REQUIRED' && snapshot.consentFormAvailable === false ? 'Consent is required but UMP has no form available; configure a published consent message in AdMob Privacy & messaging'
          : snapshot.consentError ? snapshot.consentError
        : !diagnostics.foreground ? 'App must be in the foreground'
          : snapshot.consentStatus === 'denied' ? 'UMP does not permit ad requests'
            : snapshot.consentStatus === 'unavailable' ? 'UMP consent is unavailable'
              : snapshot.loading ? 'Test interstitial is loading'
                : snapshot.ready ? 'Official test interstitial is ready' : 'Load checks UMP and requests the official Google test ad';
  const lastDisplayedAt = snapshot.lastShownAt ?? diagnostics.lastAutomaticShownAt;
  const loadDisabled = working || eligibility !== 'free' || !diagnostics.foreground || snapshot.loading || snapshot.ready || snapshot.consentStatus === 'denied' || snapshot.consentStatus === 'unavailable' || !diagnostics.testControlsEnabled;
  const showDisabled = working || eligibility !== 'free' || !diagnostics.foreground || !snapshot.ready || !diagnostics.testControlsEnabled;

  return <Page title="AdMob Testing">
    <Card>
      <Text style={styles.text}>Internal diagnostics and Google’s official test interstitial. Test displays never count toward automatic ad limits.</Text>
    </Card>

    <SectionHeader title="Environment"/>
    <Card>
      <StatusRow label="Build type" value={currentBuildType}/>
      <StatusRow label="Platform" value={Platform.OS}/>
      <StatusRow label="Runtime" value={runtime.kind}/>
      <StatusRow label="Native AdMob module" value={nativeText}/>
      <StatusRow label="Official test unit active" value={diagnostics.testUnitActive ? 'Yes' : 'No'}/>
      <StatusRow label="Test controls" value={diagnostics.testControlsEnabled ? 'Enabled' : 'Unavailable'}/>
      <StatusRow label="SDK initialized" value={snapshot.initialized ? 'Yes' : 'No'}/>
    </Card>

    <SectionHeader title="Interstitial status"/>
    <Card>
      <StatusRow label="Status" value={snapshot.loading ? 'Loading' : snapshot.ready ? 'Loaded and ready' : 'Not loaded'}/>
      <StatusRow label="Last load attempt" value={displayTime(snapshot.lastLoadAttemptAt)}/>
      <StatusRow label="Last successful load" value={displayTime(snapshot.lastLoadedAt)}/>
      <StatusRow label="Last display" value={displayTime(snapshot.lastShownAt)}/>
      <StatusRow label="Last dismissal" value={displayTime(snapshot.lastDismissedAt)}/>
      <StatusRow label="Last error" value={snapshot.lastError ?? 'None'}/>
      <StatusRow label="Manager status" value={snapshot.reason}/>
    </Card>

    <SectionHeader title="Consent"/>
    <Card>
      <StatusRow label="UMP status" value={consentText}/>
      <StatusRow label="UMP consent information" value={snapshot.consentInfoStatus}/>
      <StatusRow label="Consent form" value={consentFormText}/>
      <StatusRow label="Ad requests permitted" value={snapshot.canRequestAds === null ? 'Unknown' : snapshot.canRequestAds ? 'Yes' : 'No'}/>
      <StatusRow label="Privacy options required" value={snapshot.privacyOptionsRequired ? 'Yes' : 'No'}/>
      {!!snapshot.consentError && <StatusRow label="Consent diagnostic" value={snapshot.consentError}/>}
      {snapshot.privacyOptionsRequired && <Button title="Open privacy options" kind="ghost" onPress={async () => { await interstitialManager.showPrivacyOptions(); }}/>}
    </Card>

    <SectionHeader title="Subscription eligibility"/>
    <Card>
      <StatusRow label="RevenueCat entitlement state" value={premiumText}/>
      <StatusRow label="Premium account" value={subscription.isPremium ? 'Yes' : eligibility === 'premium' ? 'Active entitlement' : 'No confirmed Premium entitlement'}/>
      <StatusRow label="Automatic ads eligible now" value={automaticEligibleNow ? 'Yes' : 'No'}/>
      {!automaticEligibleNow && <StatusRow label="Ads suppressed because" value={automaticSuppressionReason}/>}
    </Card>

    <SectionHeader title="Automatic frequency"/>
    <Card>
      <StatusRow label="Time since launch" value={elapsed(diagnostics.launchedAt, tickNow)}/>
      <StatusRow label="Time since last displayed ad" value={elapsed(lastDisplayedAt, tickNow)}/>
      <StatusRow label="Displays in rolling 24 hours" value={String(diagnostics.shownInRolling24Hours)}/>
      <StatusRow label="Daily allowance remaining" value={String(diagnostics.remainingDailyAllowance)}/>
      <StatusRow label="Next eligible time" value={displayTime(diagnostics.nextEligibleAt)}/>
    </Card>

    <SectionHeader title="Manual test controls"/>
    <Card>
      <Button title={snapshot.loading ? 'Loading test interstitial…' : 'Load Test Interstitial'} disabled={loadDisabled} onPress={async () => { await interstitialManager.loadTestInterstitial(); }}/>
      <Button title="Show Test Interstitial" kind="ghost" disabled={showDisabled} onPress={async () => { await interstitialManager.showTestInterstitial(); }}/>
      <Text style={styles.muted}>{manualStatus}. Test requests do not use a production unit or change frequency counters.</Text>
    </Card>

    <SectionHeader title="Diagnostics"/>
    <Card>
      <Button title="Refresh Diagnostics" kind="ghost" disabled={working} onPress={refreshDiagnostics}/>
      <Button title="Copy Diagnostic Report" kind="ghost" onPress={copyReport}/>
      <Button title="Clear Diagnostic History" kind="ghost" onPress={() => interstitialManager.clearDiagnosticHistory()}/>
      {diagnostics.events.length === 0
        ? <Text style={styles.muted}>No recent diagnostic events.</Text>
        : diagnostics.events.slice(-12).reverse().map((event, index) => <View key={`${event.at}-${index}`} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9, gap: 2 }}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>{new Date(event.at).toLocaleTimeString()} · {event.event}</Text>
          {!!event.detail && <Text style={styles.muted}>{event.detail}</Text>}
        </View>)}
    </Card>
  </Page>;
}
