import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/expo';
import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesOffering, type PurchasesPackage } from 'react-native-purchases';
import { reportFailure } from '../core/monitoring';
import { activeEntitlements, hasPremium, isPurchaseCancelled, subscriptionPackages, visibleCustomerInfo } from '../services/subscriptionLogic';
import { runtimeSignals } from '../core/runtime';
import { isAccountDeletionBlocked, useAccountDeletionBlocked } from '../data/deletionLifecycle';

const apiKey = __DEV__ ? process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY
  : Platform.OS === 'android' ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
  : process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const entitlementId = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID;
const preview = runtimeSignals().kind === 'expo-go';
let configured = false;
let identityQueue: Promise<void> = Promise.resolve();
function alignIdentity(userId: string) {
  const next = identityQueue.catch(() => undefined).then(async () => {
    if (isAccountDeletionBlocked(userId)) return;
    if (!configured) { Purchases.configure({ apiKey: apiKey!, appUserID: userId }); configured = true; }
    else if (await Purchases.getAppUserID() !== userId && !isAccountDeletionBlocked(userId)) await Purchases.logIn(userId);
  });
  identityQueue = next;
  return next;
}

type State = {
  ready: boolean; loading: boolean; busy: boolean; error: string | null;
  offering: PurchasesOffering | null; info: CustomerInfo | null;
  activeIds: string[]; isPremium: boolean; entitlementId?: string;
  refresh: () => Promise<void>;
  /** `premium` is read from the CustomerInfo returned after the purchase, never from the button press. */
  purchase: (item: PurchasesPackage) => Promise<{ outcome: 'success' | 'cancelled'; premium: boolean }>;
  restore: () => Promise<{ premium: boolean }>;
};
const Context = createContext<State | null>(null);
function errorText(error: unknown) { return error instanceof Error ? error.message : 'RevenueCat could not complete this request.'; }

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, userId } = useAuth();
  const deleting = useAccountDeletionBlocked(userId);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [info, setInfo] = useState<CustomerInfo | null>(null);
  const [identifiedUser, setIdentifiedUser] = useState<string | null>(null);
  const currentUser = useRef<string | null>(null);
  const generation = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    const seq = ++generation.current;
    setReady(false); setInfo(null); setOffering(null); setError(null); setIdentifiedUser(null);
    if (!isLoaded || !userId || deleting) { currentUser.current = null; return; }
    if (!apiKey) { setError(__DEV__ ? 'RevenueCat Test Store key is missing.' : 'RevenueCat production key is missing.'); return; }
    if (__DEV__ && !apiKey.startsWith('test_')) { setError('Only a RevenueCat Test Store public key is allowed here.'); return; }
    if (!__DEV__ && apiKey.startsWith('test_')) { setError('RevenueCat Test Store is disabled in release builds.'); return; }
    if (preview) { setError('Purchases require a development build. Expo Go only previews this screen.'); return; }
    let listener: ((info: CustomerInfo) => void) | null = null;
    const start = async () => {
      setLoading(true);
      try {
        await alignIdentity(userId);
        if (seq !== generation.current) return;
        if (await Purchases.getAppUserID() !== userId) throw Error('Subscription account is still changing. Please retry.');
        currentUser.current = userId;
        listener = next => { void Purchases.getAppUserID().then(id => { if (id === userId && seq === generation.current && currentUser.current === userId) setInfo(next); }).catch(() => undefined); };
        Purchases.addCustomerInfoUpdateListener(listener);
        // CustomerInfo is the entitlement source of truth. Offerings are only
        // needed to sell plans and may be absent (for example, before Play
        // products are attached in RevenueCat). Do not let that failure make
        // a successfully identified customer's entitlement unresolved.
        const nextInfo = await Purchases.getCustomerInfo();
        if (seq !== generation.current) return;
        if (await Purchases.getAppUserID() !== userId) throw Error('Subscription account is still changing. Please retry.');
        setInfo(nextInfo); setIdentifiedUser(userId); setReady(true);
        try {
          const offers = await Purchases.getOfferings();
          if (seq !== generation.current) return;
          setOffering(offers.current);
        } catch (cause) {
          if (seq !== generation.current) return;
          setOffering(null);
          setError(errorText(cause));
          reportFailure('subscriptions-offerings', cause);
        }
      } catch (cause) { if (seq === generation.current) { reportFailure('subscriptions-initialization', cause); setError(errorText(cause)); } }
      finally { if (seq === generation.current) setLoading(false); }
    };
    void start();
    return () => { generation.current = seq + 1; currentUser.current = null; if (listener) Purchases.removeCustomerInfoUpdateListener(listener); };
  }, [isLoaded, userId, retry, deleting]);

  async function assertIdentity() {
    if (!ready || !userId || currentUser.current !== userId || await Purchases.getAppUserID() !== userId) throw Error('Subscription account is still changing. Please retry.');
  }
  async function refresh() {
    if (!ready) { setRetry(value => value + 1); return; }
    await assertIdentity(); setLoading(true); setError(null);
    try {
      const nextInfo = await Purchases.getCustomerInfo();
      await assertIdentity();
      setInfo(nextInfo);
      try {
        const offers = await Purchases.getOfferings();
        await assertIdentity();
        setOffering(offers.current);
        setError(null);
      } catch (cause) {
        setOffering(null);
        setError(errorText(cause));
        reportFailure('subscriptions-offerings', cause);
      }
    } catch (cause) { setError(errorText(cause)); throw cause; }
    finally { setLoading(false); }
  }
  async function purchase(item: PurchasesPackage): Promise<{ outcome: 'success' | 'cancelled'; premium: boolean }> {
    if (busyRef.current) return { outcome: 'cancelled', premium: hasPremium(info, entitlementId) };
    await assertIdentity();
    if (!Object.values(subscriptionPackages(offering)).some(candidate => candidate?.identifier === item.identifier)) throw Error('This plan is no longer available. Refresh plans.');
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const result = await Purchases.purchasePackage(item);
      await assertIdentity();
      setInfo(result.customerInfo);
      const updated = await Purchases.getCustomerInfo();
      await assertIdentity(); setInfo(updated);
      return { outcome: 'success', premium: hasPremium(updated, entitlementId) };
    } catch (cause) { if (isPurchaseCancelled(cause)) return { outcome: 'cancelled', premium: hasPremium(info, entitlementId) }; setError(errorText(cause)); throw cause; }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function restore(): Promise<{ premium: boolean }> {
    if (busyRef.current) return { premium: hasPremium(info, entitlementId) };
    await assertIdentity(); busyRef.current = true; setBusy(true); setError(null);
    try { const restored = await Purchases.restorePurchases(); await assertIdentity(); setInfo(restored); return { premium: hasPremium(restored, entitlementId) }; }
    catch (cause) { setError(errorText(cause)); throw cause; }
    finally { busyRef.current = false; setBusy(false); }
  }
  const safeInfo = visibleCustomerInfo(info, userId, identifiedUser);
  const safeReady = ready && !!safeInfo;
  const activeIds = activeEntitlements(safeInfo, entitlementId);
  const value: State = { ready: safeReady, loading, busy, error, offering: safeReady ? offering : null, info: safeInfo, activeIds, isPremium: safeReady && hasPremium(safeInfo, entitlementId), entitlementId, refresh, purchase, restore };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSubscription() { const value = useContext(Context); if (!value) throw Error('SubscriptionProvider is missing'); return value; }
