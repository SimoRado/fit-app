import React, { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useApp } from './app';
import { useSubscription } from './subscriptions';
import { adEligibility } from '../services/adEligibility';
import { interstitialManager } from '../services/adMob';
import { accountAdEligible } from '../services/adAgeEligibility';

export function AdEligibilityBridge({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, profile, legalAccepted, ageRejected } = useApp();
  const { isAuthenticated } = useConvexAuth();
  const remoteEligibility = useQuery(api.eligibility.current, isAuthenticated ? {} : 'skip');
  const { ready: subscriptionReady, loading, busy, info } = useSubscription();
  const activeEntitlementCount = Object.keys(info?.entitlements.active ?? {}).length;
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const adult = ready && accountAdEligible({ authenticated: isAuthenticated, birthDate: profile?.birth_date, legalAccepted, ageRejected, serverAdult: remoteEligibility?.adult === true && remoteEligibility.rejected !== true, serverTermsVersion: remoteEligibility?.termsVersion });
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => () => interstitialManager.setContext({ eligibility: 'unresolved', safeScreen: false, foreground: false }), []);
  useEffect(() => {
    if (foreground && adult) void interstitialManager.refreshConsent();
  }, [foreground, adult]);
  useEffect(() => {
    const eligibility = adult ? adEligibility({ ready: subscriptionReady, loading, busy, activeEntitlementCount }) : 'unresolved';
    interstitialManager.setContext({
      eligibility,
      // Only home and workout history are safe post-completion destinations.
      safeScreen: pathname === '/' || pathname.endsWith('/index') || pathname.endsWith('/workouts'),
      foreground,
    });
  }, [adult, subscriptionReady, loading, busy, activeEntitlementCount, pathname, foreground]);
  return <>{children}</>;
}
