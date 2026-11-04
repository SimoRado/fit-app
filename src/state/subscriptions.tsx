import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import Purchases, { type CustomerInfo, type PurchasesOffering, type PurchasesPackage } from 'react-native-purchases';
import { activeEntitlements, isPurchaseCancelled, subscriptionPackages } from '../services/subscriptionLogic';

const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
const entitlementId = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID;
const preview = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
let configured = false;

type State = {
  ready: boolean; loading: boolean; busy: boolean; error: string | null;
  offering: PurchasesOffering | null; info: CustomerInfo | null;
  activeIds: string[]; isPremium: boolean; entitlementId?: string;
  refresh: () => Promise<void>; purchase: (item: PurchasesPackage) => Promise<'success' | 'cancelled'>;
  restore: () => Promise<void>;
};
const Context = createContext<State | null>(null);
function errorText(error: unknown) { return error instanceof Error ? error.message : 'RevenueCat could not complete this request.'; }

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, userId } = useAuth();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [info, setInfo] = useState<CustomerInfo | null>(null);
  const currentUser = useRef<string | null>(null);
  const generation = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    const seq = ++generation.current;
    setReady(false); setInfo(null); setOffering(null); setError(null);
    if (!isLoaded || !userId) { currentUser.current = null; return; }
    if (!apiKey) { setError('RevenueCat Test Store key is missing.'); return; }
    if (!apiKey.startsWith('test_')) { setError('Only a RevenueCat Test Store public key is allowed here.'); return; }
    if (!__DEV__) { setError('Test Store is disabled in release builds.'); return; }
    if (preview) { setError('Purchases require a development build. Expo Go only previews this screen.'); return; }
    let listener: ((info: CustomerInfo) => void) | null = null;
    const start = async () => {
      setLoading(true);
      try {
        if (!configured) { Purchases.configure({ apiKey, appUserID: userId }); configured = true; }
        else if (await Purchases.getAppUserID() !== userId) await Purchases.logIn(userId);
        if (seq !== generation.current) return;
        currentUser.current = userId;
        listener = next => { if (seq === generation.current && currentUser.current === userId) setInfo(next); };
        Purchases.addCustomerInfoUpdateListener(listener);
        const [nextInfo, offers] = await Promise.all([Purchases.getCustomerInfo(), Purchases.getOfferings()]);
        if (seq !== generation.current) return;
        setInfo(nextInfo); setOffering(offers.current); setReady(true);
      } catch (cause) { if (seq === generation.current) setError(errorText(cause)); }
      finally { if (seq === generation.current) setLoading(false); }
    };
    void start();
    return () => { generation.current = seq + 1; currentUser.current = null; if (listener) Purchases.removeCustomerInfoUpdateListener(listener); };
  }, [isLoaded, userId, retry]);

  async function assertIdentity() {
    if (!ready || !userId || currentUser.current !== userId || await Purchases.getAppUserID() !== userId) throw Error('Subscription account is still changing. Please retry.');
  }
  async function refresh() {
    if (!ready) { setRetry(value => value + 1); return; }
    await assertIdentity(); setLoading(true); setError(null);
    try { const [nextInfo, offers] = await Promise.all([Purchases.getCustomerInfo(), Purchases.getOfferings()]); await assertIdentity(); setInfo(nextInfo); setOffering(offers.current); }
    catch (cause) { setError(errorText(cause)); throw cause; }
    finally { setLoading(false); }
  }
  async function purchase(item: PurchasesPackage): Promise<'success' | 'cancelled'> {
    if (busyRef.current) return 'cancelled';
    await assertIdentity();
    if (!Object.values(subscriptionPackages(offering)).some(candidate => candidate?.identifier === item.identifier)) throw Error('This plan is no longer available. Refresh plans.');
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const result = await Purchases.purchasePackage(item);
      await assertIdentity();
      setInfo(result.customerInfo);
      const updated = await Purchases.getCustomerInfo();
      await assertIdentity(); setInfo(updated);
      return 'success';
    } catch (cause) { if (isPurchaseCancelled(cause)) return 'cancelled'; setError(errorText(cause)); throw cause; }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function restore() {
    if (busyRef.current) return;
    await assertIdentity(); busyRef.current = true; setBusy(true); setError(null);
    try { const restored = await Purchases.restorePurchases(); await assertIdentity(); setInfo(restored); }
    catch (cause) { setError(errorText(cause)); throw cause; }
    finally { busyRef.current = false; setBusy(false); }
  }
  const activeIds = activeEntitlements(info, entitlementId);
  const value: State = { ready, loading, busy, error, offering, info, activeIds, isPremium: ready && !!entitlementId && activeIds.length > 0, entitlementId, refresh, purchase, restore };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSubscription() { const value = useContext(Context); if (!value) throw Error('SubscriptionProvider is missing'); return value; }
