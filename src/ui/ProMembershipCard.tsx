import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { proStatus, type ProSignal } from '../core/proAccess';
import { Text } from './LocalizedText';
import { MotionPressable } from './MotionPressable';
import { HeroWaves, LotusFlower, linearGradient } from './LotusArt';
import { CubyMark } from './CubyMark';
import { fonts, brand } from './theme';
import { usePalette } from './voltKit';

/**
 * Profile Cubyfit Pro card, between the stat cards and the settings list.
 *
 * Free → promotional card with "Explore Pro"; Pro → compact membership status with "Manage".
 * While RevenueCat is still resolving (or unreachable offline) the entitlement is unknown, so the
 * card shows a neutral status and never claims the user is Free. Every state opens the existing
 * RevenueCat paywall (`onOpen`), which lists the live offerings, purchase, restore and — for Pro
 * members — subscription management.
 */
export function ProMembershipCard({ signal, onOpen }: { signal: ProSignal; onOpen: () => void }) {
  const p = usePalette();
  const status = proStatus(signal);
  const volt = p.style === 'volt';
  // Volt: navy hero with the volt-lime action. Lotus: violet → orchid hero with a white action.
  const actionBg = volt ? p.lime : '#FFFFFF';
  const actionInk = volt ? brand.ink : brand.violet;
  const glow = volt ? (p.light ? '0px 14px 30px -14px rgba(11,20,70,0.55)' : undefined)
    : p.light ? '0px 18px 40px -16px rgba(73,16,139,0.55)' : '0px 0px 0px 1px rgba(226,110,229,0.18), 0px 20px 44px -18px rgba(226,110,229,0.35)';
  const surface = { borderRadius: 24, overflow: 'hidden' as const, backgroundImage: linearGradient(140, p.hero), ...(glow ? { boxShadow: glow } : {}) };

  if (status === 'pro') {
    return <MotionPressable pressScale={0.98} accessibilityRole="button" accessibilityLabel="Cubyfit Pro is active. Manage your membership" onPress={onOpen}
      style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, ...surface }}>
      {!volt && <LotusFlower size={120} style={{ right: -30, top: -34 }}/>}
      <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' }}><CubyMark size={30} tile={false} variant="brand"/></View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: '#FFFFFF', fontFamily: fonts.displayHeavy, fontSize: 15 }}>Cubyfit Pro</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: actionBg }}>
            <Ionicons name="checkmark" size={10} color={actionInk}/>
            <Text style={{ color: actionInk, fontFamily: fonts.bold, fontSize: 9.5, letterSpacing: 0.6, textTransform: 'uppercase' }}>Active</Text>
          </View>
        </View>
        <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.78)', fontFamily: fonts.medium, fontSize: 11.5 }}>Every feature unlocked · manage your membership</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#FFFFFF"/>
    </MotionPressable>;
  }

  const unknown = status !== 'free';
  const statusLine = status === 'checking' ? 'Checking your membership…' : status === 'unavailable' ? 'Membership status unavailable right now' : null;
  const action = unknown ? 'View Pro' : 'Explore Pro';
  return <MotionPressable pressScale={0.98} accessibilityRole="button" accessibilityLabel={unknown ? `Cubyfit Pro. ${statusLine}` : 'Cubyfit Pro. Unlock your full potential. Explore Pro'} onPress={onOpen}
    style={{ marginTop: 12, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14, gap: 4, ...surface }}>
    {volt ? null : <><LotusFlower size={170} style={{ right: -42, top: -40 }}/><HeroWaves/></>}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ionicons name="sparkles" size={12} color={volt ? p.lime : '#FFFFFF'}/>
      <Text style={{ color: volt ? p.lime : '#FFFFFF', fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 1.1 }}>CUBYFIT PRO</Text>
    </View>
    <Text style={{ color: '#FFFFFF', fontFamily: fonts.displayHeavy, fontSize: 21, lineHeight: 25, letterSpacing: -0.5, marginTop: 2 }}>Unlock your full potential.</Text>
    <Text style={{ color: 'rgba(255,255,255,0.8)', fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17, maxWidth: '92%' }}>More habits, unlimited routines, and deeper progress insights.</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10 }}>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {status === 'checking' && <ActivityIndicator size="small" color="rgba(255,255,255,0.8)"/>}
        {!!statusLine && <Text numberOfLines={2} style={{ flexShrink: 1, color: 'rgba(255,255,255,0.72)', fontFamily: fonts.medium, fontSize: 11 }}>{statusLine}</Text>}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: actionBg }}>
        <Text style={{ color: actionInk, fontFamily: fonts.bold, fontSize: 12.5 }}>{action}</Text>
        <Ionicons name="arrow-forward" size={13} color={actionInk}/>
      </View>
    </View>
  </MotionPressable>;
}
