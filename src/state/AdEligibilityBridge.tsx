import React, { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { useApp } from './app';
import { useSubscription } from './subscriptions';
import { adEligibility } from '../services/adEligibility';
import { interstitialManager } from '../services/adMob';

export function AdEligibilityBridge({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, profile } = useApp();
  const { ready: subscriptionReady, loading, busy, error, info } = useSubscription();
  const activeEntitlementCount = Object.keys(info?.entitlements.active ?? {}).length;
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => () => interstitialManager.setContext({ eligibility: 'unresolved', safeScreen: false, foreground: false }), []);
  useEffect(() => {
    const eligibility = ready && profile ? adEligibility({ ready: subscriptionReady, loading, busy, error, activeEntitlementCount }) : 'unresolved';
    interstitialManager.setContext({
      eligibility,
      // Only home and workout history are safe post-completion destinations.
      safeScreen: pathname === '/' || pathname.endsWith('/index') || pathname.endsWith('/workouts'),
      foreground,
    });
  }, [ready, profile, subscriptionReady, loading, busy, error, activeEntitlementCount, pathname, foreground]);
  return <>{children}</>;
}
