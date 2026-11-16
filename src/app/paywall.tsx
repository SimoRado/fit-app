import React from 'react';
import { router } from 'expo-router';
import { Paywall } from '../ui/Paywall';

/** Presented as a full-screen modal; closing returns to the screen underneath, which stays mounted. */
export default function PaywallScreen() {
  return <Paywall onClose={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); }}/>;
}
