import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../LocalizedText';
import { fonts } from '../theme';
import { isLight, usePalette } from '../voltKit';
import { CardBackdrop } from './MotivationCardFace';

/** Last stop of the daily deck: no extra cards are generated past the allowance. */
export function EndOfDeckCard({ width, height, seen, isPro }: { width: number; height: number; seen: number; isPro: boolean }) {
  const p = usePalette();
  const light = isLight(p);
  const pad = Math.round(width * 0.075);
  return <View style={{ width, height, borderRadius: 28, overflow: 'hidden', backgroundColor: light ? '#FFFFFF' : p.card, borderWidth: 1, borderColor: light ? '#DCE8F8' : p.borderStrong }}>
    <CardBackdrop width={width} height={height}/>
    <View style={{ flex: 1, padding: pad, justifyContent: 'space-between' }}>
      <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.9 }}>{`${String(seen).padStart(2, '0')} / ${String(seen).padStart(2, '0')}`}</Text>
      <View style={{ gap: 14 }}>
        <View style={{ width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: light ? p.paleBlue : 'rgba(185,138,240,0.16)' }}>
          <Ionicons name={isPro ? 'checkmark-done' : 'sparkles'} size={26} color={light ? p.accent : p.g1}/>
        </View>
        <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: Math.round(width * 0.092), lineHeight: Math.round(width * 0.098), textTransform: 'uppercase' }}>That’s today’s deck</Text>
        <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 }}>New cards arrive tomorrow.</Text>
        {!isPro && <Text style={{ color: light ? p.accent : p.g1, fontFamily: fonts.bold, fontSize: 14, lineHeight: 20 }}>Cubyfit Pro unlocks 10 cards a day.</Text>}
      </View>
      <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.9 }}>CUBYFIT</Text>
    </View>
  </View>;
}
