import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, ZoomIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Text } from '../LocalizedText';
import { MotionPressable } from '../MotionPressable';
import { useReducedMotion } from '../motion';
import { fonts } from '../theme';
import { CircleButton, isLight, usePalette } from '../voltKit';
import { MotivationCardFace } from './MotivationCardFace';
import type { CardLanguage, MotivationCard } from '../../core/motivationCatalog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const RATIO = 5.4 / 4;

type Props = {
  cards: MotivationCard[]; language: CardLanguage; contentWidth: number;
  savedIds: ReadonlySet<string>; onToggleSaved: (card: MotivationCard) => void; onShare: (card: MotivationCard) => void;
  onBrowse: () => void;
};

/** Saved tab: two-column thumbnails (prototype `.sgrid` / `.mcard.mini`) and an enlarged reader. */
export function SavedLibrary({ cards, language, contentWidth, savedIds, onToggleSaved, onShare, onBrowse }: Props) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState<MotivationCard | null>(null);
  const thumbWidth = Math.floor((contentWidth - 12) / 2);
  const thumbHeight = Math.round(thumbWidth * RATIO);
  if (!cards.length) return <Animated.View entering={reduced ? undefined : FadeIn.duration(220)} style={{ marginTop: 48, alignItems: 'center', gap: 14, paddingHorizontal: 20 }}>
    <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: p.soft1 }}><Ionicons name="heart-outline" size={30} color={p.accent}/></View>
    <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 20, textAlign: 'center' }}>Nothing saved yet</Text>
    <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 260 }}>Tap the heart on any card to keep it here. Saved cards stay with you, even after the day ends.</Text>
    <MotionPressable pressScale={0.96} accessibilityRole="button" onPress={onBrowse} style={{ marginTop: 4, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 999, backgroundColor: p.g1 }}>
      <Text style={{ color: p.plInk, fontFamily: fonts.bold, fontSize: 13 }}>Browse cards</Text>
    </MotionPressable>
  </Animated.View>;
  return <>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
      {cards.map((card, i) => <Animated.View key={card.id} entering={reduced ? undefined : FadeIn.duration(260).delay(Math.min(i, 8) * 35)}>
        <MotionPressable pressScale={0.97} accessibilityRole="button" accessibilityLabel={`Open saved card: ${card.text[language]}`} onPress={() => setOpen(card)}
          style={{ borderRadius: 22, shadowColor: p.navShadow, shadowOpacity: isLight(p) ? 0.1 : 0, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: isLight(p) ? 3 : 0, backgroundColor: isLight(p) ? '#FFFFFF' : p.card }}>
          <MotivationCardFace card={card} language={language} width={thumbWidth} height={thumbHeight} mini/>
        </MotionPressable>
      </Animated.View>)}
    </View>
    <SavedReader card={open} language={language} saved={!!open && savedIds.has(open.id)} onClose={() => setOpen(null)} onToggleSaved={onToggleSaved} onShare={onShare}/>
  </>;
}

function SavedReader({ card, language, saved, onClose, onToggleSaved, onShare }: { card: MotivationCard | null; language: CardLanguage; saved: boolean; onClose: () => void; onToggleSaved: (card: MotivationCard) => void; onShare: (card: MotivationCard) => void }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Keep the last card while the modal fades out.
  const [shown, setShown] = useState(card);
  useEffect(() => { if (card) setShown(card); }, [card]);
  const cardWidth = Math.min(width - 36, 380, (height - insets.top - insets.bottom - 170) / RATIO);
  const light = isLight(p);
  return <Modal visible={!!card} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: light ? 'rgba(11,20,70,0.55)' : 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close card" onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}/>
      {shown && <Animated.View entering={reduced ? undefined : ZoomIn.duration(240).withInitialValues({ transform: [{ scale: 0.92 }] })} exiting={reduced ? undefined : FadeOut.duration(120)} style={{ gap: 18, alignItems: 'center' }}>
        <View style={{ borderRadius: 28, backgroundColor: light ? '#FFFFFF' : p.card, elevation: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } }}>
          <MotivationCardFace card={shown} language={language} width={cardWidth} height={cardWidth * RATIO}/>
        </View>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <CircleButton icon="close" size={52} label="Back to saved cards" onPress={onClose}/>
          <HeartButton saved={saved} cardKey={shown.id} onPress={() => onToggleSaved(shown)}/>
          <CircleButton icon="share-outline" size={52} label="Share card" onPress={() => onShare(shown)}/>
        </View>
        {!saved && <Text style={{ color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 12.5 }}>Removed from Saved. Tap the heart to keep it.</Text>}
      </Animated.View>}
    </View>
  </Modal>;
}

/**
 * Volt favorite control: light-blue fill + filled navy heart when saved. The small pop plays only
 * when this card is saved — not when swiping onto a card that was saved earlier.
 */
export function HeartButton({ saved, onPress, cardKey, size = 52, disabled }: { saved: boolean; onPress: () => void; cardKey?: string; size?: number; disabled?: boolean }) {
  const p = usePalette();
  const light = isLight(p);
  const reduced = useReducedMotion();
  const pop = useSharedValue(1);
  const previous = useRef({ cardKey, saved });
  useEffect(() => {
    const was = previous.current;
    previous.current = { cardKey, saved };
    if (!reduced && was.cardKey === cardKey && !was.saved && saved) pop.value = withSequence(withTiming(1.24, { duration: 110 }), withSpring(1, { damping: 11, stiffness: 320 }));
  }, [cardKey, saved, reduced, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return <MotionPressable pressScale={0.88} accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved' : 'Save card'} accessibilityState={{ selected: saved, disabled: !!disabled }} disabled={disabled} hitSlop={6} onPress={onPress}
    style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1,
      backgroundColor: saved ? (light ? p.blue : 'rgba(156,203,255,0.18)') : p.c8, borderWidth: light ? 0 : 1, borderColor: saved ? p.blue : p.borderStrong,
      ...(light ? { shadowColor: p.navShadow, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 } : {}) }}>
    <Animated.View style={popStyle}>
      <Ionicons name={saved ? 'heart' : 'heart-outline'} size={size * 0.46} color={saved ? (light ? p.text : p.blue) : p.text}/>
    </Animated.View>
  </MotionPressable>;
}
