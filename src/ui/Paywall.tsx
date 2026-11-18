/**
 * Cubyfit Pro paywall. Plans, prices and trials come from the current
 * RevenueCat offering; Pro access comes only from the verified entitlement in
 * CustomerInfo (see SubscriptionProvider).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Purchases from 'react-native-purchases';
import { Text } from './LocalizedText';
import { MotionPressable } from './MotionPressable';
import { fonts, brand } from './theme';
import { usePalette, type VoltIcon } from './voltKit';
import { useSubscription } from '../state/subscriptions';
import { subscriptionPackages } from '../services/subscriptionLogic';
import { annualSavingsPercent, buildPlans, ctaLabel, disclosure, planSubtitle, purchaseErrorMessage, storeName, timeline, type Plan, type StorePlatform, type TrialEligibility } from '../services/paywallLogic';

const hero = require('../../assets/paywall/hero.webp');
const HERO_RATIO = 585 / 442;
const platform: StorePlatform = Platform.OS === 'ios' ? 'ios' : 'android';
const httpsUrl = (value: string | undefined) => value && /^https:\/\/\S+$/.test(value) ? value : null;
const termsUrl = httpsUrl(process.env.EXPO_PUBLIC_TERMS_URL);
const privacyUrl = httpsUrl(process.env.EXPO_PUBLIC_PRIVACY_URL);

/**
 * Pro currently removes ads; the features below are part of the routine Pro
 * keeps uninterrupted. Copy only describes features that exist today.
 */
const benefits: { icon: VoltIcon; title: string; text: string }[] = [
  { icon: 'checkmark-circle-outline', title: 'Unlimited habits', text: 'Daily, weekly and quantity habits with streaks' },
  { icon: 'bar-chart-outline', title: 'Full progress', text: 'Week, month and year views' },
  { icon: 'restaurant-outline', title: 'Smarter nutrition', text: 'Personal calorie and macro targets' },
  { icon: 'barbell-outline', title: 'Every workout', text: 'Full library, saved routines, history' },
];

export function Paywall({ onClose }: { onClose: () => void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const subscription = useSubscription();
  const [eligibility, setEligibility] = useState<Record<string, TrialEligibility>>({});
  const [selected, setSelected] = useState<'annual' | 'monthly'>('annual');
  const [notice, setNotice] = useState<string | null>(null);
  const [working, setWorking] = useState<'purchase' | 'restore' | null>(null);
  const pending = useRef(false);
  const packages = subscriptionPackages(subscription.offering);
  const plans = useMemo(() => buildPlans(packages, platform, eligibility), [packages.annual, packages.monthly, eligibility]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = plans.find(item => item.kind === selected) ?? plans[0] ?? null;
  const savings = annualSavingsPercent(plans);
  const contentWidth = Math.min(width, 560);
  const heroWidth = Math.min(contentWidth - 24, 440);

  // iOS needs an explicit eligibility check before promising an introductory trial.
  useEffect(() => {
    if (platform !== 'ios' || !subscription.ready) return;
    const ids = [packages.annual, packages.monthly].filter(Boolean).map(item => item!.product.identifier);
    if (!ids.length) return;
    let active = true;
    void Purchases.checkTrialOrIntroductoryPriceEligibility(ids).then(result => {
      if (!active) return;
      const next: Record<string, TrialEligibility> = {};
      for (const [id, value] of Object.entries(result)) next[id] = value.status === Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE ? 'eligible' : value.status === Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE ? 'ineligible' : 'unknown';
      setEligibility(next);
    }).catch(() => undefined); // Unknown → no trial is promised.
    return () => { active = false; };
  }, [subscription.ready, packages.annual, packages.monthly]);

  async function buy() {
    const item = plan ? (plan.kind === 'annual' ? packages.annual : packages.monthly) : null;
    if (!item || pending.current || subscription.busy) return;
    pending.current = true; setWorking('purchase'); setNotice(null);
    try {
      const result = await subscription.purchase(item);
      if (result.outcome === 'cancelled') { setNotice('Purchase cancelled. You have not been charged.'); return; }
      if (result.premium) { Alert.alert('Welcome to Cubyfit Pro', 'Your Pro access is active.', [{ text: 'Continue', onPress: onClose }]); return; }
      setNotice('The store confirmed your purchase, but Pro is not active on this account yet. Wait a moment, then tap Restore purchases.');
    } catch (error) { setNotice(purchaseErrorMessage(error)); }
    finally { pending.current = false; setWorking(null); }
  }
  async function restore() {
    if (pending.current || subscription.busy) return;
    pending.current = true; setWorking('restore'); setNotice(null);
    try {
      const result = await subscription.restore();
      if (result.premium) Alert.alert('Purchases restored', 'Your Cubyfit Pro access is active.', [{ text: 'Continue', onPress: onClose }]);
      else setNotice(`No active Cubyfit Pro subscription was found for this ${storeName(platform)} account.`);
    } catch (error) { setNotice(`${purchaseErrorMessage(error)} You can retry Restore purchases.`); }
    finally { pending.current = false; setWorking(null); }
  }
  async function manage() {
    try {
      if (platform === 'ios') { await Purchases.showManageSubscriptions(); return; }
      const url = httpsUrl(subscription.info?.managementURL ?? undefined) ?? 'https://play.google.com/store/account/subscriptions';
      await Linking.openURL(url);
    } catch (error) { setNotice(purchaseErrorMessage(error)); }
  }

  const footerLinks = <View style={{ alignItems: 'center', gap: 10, marginTop: 6 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
      {termsUrl && <Text accessibilityRole="link" onPress={() => { void Linking.openURL(termsUrl); }} style={{ color: p.text, fontFamily: fonts.semibold, fontSize: 13, textDecorationLine: 'underline' }}>Terms of Use</Text>}
      {termsUrl && privacyUrl && <Text style={{ color: p.muted }}>·</Text>}
      {privacyUrl && <Text accessibilityRole="link" onPress={() => { void Linking.openURL(privacyUrl); }} style={{ color: p.text, fontFamily: fonts.semibold, fontSize: 13, textDecorationLine: 'underline' }}>Privacy Policy</Text>}
      {(termsUrl || privacyUrl) && <Text style={{ color: p.muted }}>·</Text>}
      <Text accessibilityRole="button" onPress={() => { void restore(); }} style={{ color: p.text, fontFamily: fonts.semibold, fontSize: 13, textDecorationLine: 'underline' }}>{working === 'restore' ? 'Restoring…' : 'Restore purchases'}</Text>
    </View>
    {__DEV__ && (!termsUrl || !privacyUrl) && <Text style={{ color: p.danger, fontSize: 11, textAlign: 'center' }}>DEV: set EXPO_PUBLIC_TERMS_URL and EXPO_PUBLIC_PRIVACY_URL — legal links are hidden until real URLs exist.</Text>}
  </View>;

  const closeButton = <MotionPressable pressScale={0.9} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={onClose}
    style={{ position: 'absolute', top: insets.top + 8, left: 16, zIndex: 10, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: p.c8, shadowColor: p.navShadow, shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
    <Ionicons name="close" size={22} color={p.text}/>
  </MotionPressable>;

  const header = <>
    <Image source={hero} accessible accessibilityLabel="Water bottle, dumbbell, habit calendar, yoga mat, smartwatch and a healthy breakfast" resizeMode="contain" style={{ width: heroWidth, height: heroWidth / HERO_RATIO, alignSelf: 'center' }}/>
    <View style={{ alignItems: 'center', marginTop: 4 }}>
      <Text accessibilityRole="header" style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 36, lineHeight: 38, letterSpacing: -1.2, textAlign: 'center' }}>{subscription.isPremium ? 'Your whole\nroutine is' : 'Your whole\nroutine,'}</Text>
      <View style={{ marginTop: 2, paddingHorizontal: 8, borderRadius: 12, backgroundColor: p.lime }}>
        <Text style={{ color: brand.ink, fontFamily: fonts.displayHeavy, fontSize: 36, lineHeight: 40, letterSpacing: -1.2 }}>unlocked.</Text>
      </View>
    </View>
  </>;

  // ── Already Pro: no trial pitch, offer management instead. ──
  if (subscription.isPremium) {
    const active = subscription.entitlementId ? subscription.info?.entitlements.active[subscription.entitlementId] : undefined;
    const until = active?.expirationDate ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(active.expirationDate)) : null;
    return <View style={{ flex: 1, backgroundColor: p.bg }}>
      {closeButton}
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32, paddingHorizontal: 20, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        {header}
        <Text style={{ color: p.muted, fontSize: 14.5, textAlign: 'center' }}>Cubyfit Pro is active on this account.</Text>
        {until && <Text style={{ color: p.text, fontFamily: fonts.semibold, fontSize: 13.5, textAlign: 'center' }}>{active?.willRenew ? `Renews on ${until}` : `Access until ${until}`}{active?.periodType === 'TRIAL' ? ' · free trial' : ''}</Text>}
        <PrimaryButton title="Manage subscription" onPress={() => { void manage(); }}/>
        {!!notice && <Text accessibilityRole="alert" style={{ color: p.muted, fontSize: 12.5, textAlign: 'center' }}>{notice}</Text>}
        {footerLinks}
      </ScrollView>
    </View>;
  }

  const unavailable = subscription.ready && !plans.length;
  return <View style={{ flex: 1, backgroundColor: p.bg }}>
    {closeButton}
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 24, paddingHorizontal: 20, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
      {header}
      <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 14.5, lineHeight: 20, textAlign: 'center', marginTop: 10 }}>Training, food and habits in one place, without ads.</Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, marginTop: 20 }}>
        {benefits.map(item => <View key={item.title} style={{ width: '50%', flexDirection: 'row', gap: 10, paddingRight: 8 }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: p.light ? '#E4EFFD' : p.soft1 }}><Ionicons name={item.icon} size={20} color={p.accent}/></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 14.5 }}>{item.title}</Text>
            <Text style={{ color: p.muted, fontSize: 12.5, lineHeight: 17 }}>{item.text}</Text>
          </View>
        </View>)}
      </View>

      {!subscription.ready ? <View style={{ alignItems: 'center', gap: 10, marginTop: 24 }}>
        {subscription.error ? <>
          <Text style={{ color: p.muted, textAlign: 'center' }}>{subscription.error}</Text>
          <PrimaryButton title="Try again" onPress={() => { void subscription.refresh().catch(() => undefined); }} small/>
        </> : <ActivityIndicator color={p.accent}/>}
      </View> : unavailable ? <View style={{ alignItems: 'center', gap: 10, marginTop: 24 }}>
        <Text style={{ color: p.muted, textAlign: 'center' }}>{subscription.offering ? 'Cubyfit Pro plans are not available yet. Please try again later.' : 'Plans could not be loaded. Check your connection and try again.'}</Text>
        <PrimaryButton title="Try again" onPress={() => { void subscription.refresh().catch(() => undefined); }} small/>
      </View> : <>
        <View style={{ gap: 12, marginTop: 22 }}>
          {plans.map(item => <PlanCard key={item.kind} plan={item} selected={plan?.kind === item.kind} badge={item.kind === 'annual' && savings ? `Save ${savings}%` : null} onPress={() => setSelected(item.kind)}/>)}
        </View>
        {plan && <Timeline plan={plan}/>}
      </>}

      {!!notice && <Text accessibilityRole="alert" style={{ color: p.text, fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 14 }}>{notice}</Text>}
      <View style={{ marginTop: 18 }}>{footerLinks}</View>
      {__DEV__ && <DevDiagnostics plans={plans}/>}
    </ScrollView>

    {/* Sticky purchase area: CTA and the billing terms that apply to it. */}
    {plan && subscription.ready && <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 12, backgroundColor: p.bg, borderTopWidth: 1, borderTopColor: p.border }}>
      <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 8 }}>
        <PrimaryButton title={working === 'purchase' ? 'Processing…' : ctaLabel(plan)} disabled={!!working || subscription.busy} onPress={() => { void buy(); }}/>
        <Text style={{ color: p.muted, fontSize: 11.5, lineHeight: 16, textAlign: 'center' }}>{disclosure(plan, platform)}</Text>
      </View>
    </View>}
  </View>;
}

function PrimaryButton({ title, onPress, disabled, small }: { title: string; onPress: () => void; disabled?: boolean; small?: boolean }) {
  const p = usePalette();
  const light = p.light;
  return <MotionPressable pressScale={0.98} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={{ minHeight: small ? 46 : 58, paddingHorizontal: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: light ? brand.ink : p.lime, opacity: disabled ? 0.6 : 1, alignSelf: small ? 'center' : 'stretch' }}>
    <Text style={{ color: light ? '#FFFFFF' : brand.ink, fontFamily: fonts.displayHeavy, fontSize: small ? 15 : 18, letterSpacing: -0.3 }}>{title}</Text>
  </MotionPressable>;
}

function PlanCard({ plan, selected, badge, onPress }: { plan: Plan; selected: boolean; badge: string | null; onPress: () => void }) {
  const p = usePalette();
  const light = p.light;
  const navy = light ? brand.ink : p.lime;
  return <MotionPressable selected={selected} pressScale={0.98} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${plan.kind === 'annual' ? 'Yearly' : 'Monthly'}, ${plan.perMonth} per month. ${planSubtitle(plan)}`} onPress={onPress}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 78, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 22, backgroundColor: p.c8, borderWidth: 2, borderColor: selected ? navy : light ? 'transparent' : p.c8Line, ...(light ? { shadowColor: p.navShadow, shadowOpacity: selected ? 0.08 : 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 } : {}) }}>
    <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? navy : light ? '#E4EAF5' : p.card2 }}>
      {selected && <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: light ? '#FFFFFF' : brand.ink }}/>}
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 18 }}>{plan.kind === 'annual' ? 'Yearly' : 'Monthly'}</Text>
      <Text style={{ color: p.muted, fontSize: 12.5 }}>{planSubtitle(plan)}</Text>
    </View>
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 20 }}>{plan.perMonth}</Text>
      <Text style={{ color: p.muted, fontSize: 12 }}>/ month</Text>
    </View>
    {badge && <View style={{ position: 'absolute', top: -12, right: 40, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: p.lime }}>
      <Text style={{ color: brand.ink, fontFamily: fonts.bold, fontSize: 12 }}>{badge}</Text>
    </View>}
  </MotionPressable>;
}

function Timeline({ plan }: { plan: Plan }) {
  const p = usePalette();
  const steps = timeline(plan, platform);
  return <View accessibilityLabel="Billing timeline" style={{ marginTop: 18, paddingHorizontal: 6 }}>
    {steps.map((step, index) => <View key={step.label + index} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40 }}>
      <View style={{ width: 22, alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center' }}>
        {index > 0 && <View style={{ position: 'absolute', top: 0, height: '50%', width: 1.5, backgroundColor: p.borderStrong }}/>}
        {index < steps.length - 1 && <View style={{ position: 'absolute', bottom: 0, height: '50%', width: 1.5, backgroundColor: p.borderStrong }}/>}
        <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: index === 0 ? brand.ink : p.borderStrong, backgroundColor: index === 0 ? p.lime : p.bg }}/>
      </View>
      <Text style={{ width: 92, marginLeft: 12, color: p.text, fontFamily: fonts.displayHeavy, fontSize: 14.5 }}>{step.label}</Text>
      <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: p.border, marginRight: 12 }}/>
      <Text style={{ flex: 1, color: p.muted, fontSize: 13, lineHeight: 18, paddingVertical: 6 }}>{step.text}</Text>
    </View>)}
  </View>;
}

/** Development only: shows what RevenueCat actually returned, for verifying the store setup. */
function DevDiagnostics({ plans }: { plans: Plan[] }) {
  const p = usePalette();
  const subscription = useSubscription();
  const offering = subscription.offering;
  const rows = [
    `Offering: ${offering?.identifier ?? 'none'} · packages: ${offering?.availablePackages.map(item => `${item.identifier}(${item.product.identifier})`).join(', ') || 'none'}`,
    `Entitlement ID configured: ${subscription.entitlementId ? 'yes' : 'NO'} · active: ${subscription.activeIds.join(', ') || 'none'}`,
    ...plans.map(plan => `${plan.kind}: ${plan.product.identifier} ${plan.billed} ${plan.product.currencyCode} period=${plan.product.subscriptionPeriod ?? '?'} freePhase=${JSON.stringify(plan.product.defaultOption?.freePhase?.billingPeriod ?? null)} intro=${JSON.stringify(plan.product.introPrice ?? null)} trial=${plan.trial ? `${plan.trial.days}d` : 'none'}`),
  ];
  return <Pressable onLongPress={() => console.log('[paywall]', rows.join('\n'))} style={{ marginTop: 16, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: p.border }}>
    {rows.map(row => <Text key={row} selectable style={{ color: p.muted, fontFamily: fonts.mono, fontSize: 10 }}>{row}</Text>)}
  </Pressable>;
}
