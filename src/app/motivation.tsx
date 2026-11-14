import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import { Text } from '../ui/LocalizedText';
import { cards } from '../core/cards';
import { Favorite } from '../core/types';
import { dayKey, fromDay } from '../core/date';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { Page, message } from '../ui/components';
import { fonts } from '../ui/theme';
import { useReducedMotion } from '../ui/motion';
import { MotionPressable } from '../ui/MotionPressable';
import { CircleButton, Segmented, isLight, usePalette } from '../ui/voltKit';

const categories = ['All', 'Discipline', 'Fitness', 'Consistency', 'Confidence', 'Productivity', 'Personal Growth'];

/** Volt Motivation: Discover/Saved switch, category chips, poster card and round controls. */
export default function Motivation() {
  const { profile, language, revision, changed } = useApp();
  const p = usePalette();
  const reduced = useReducedMotion();
  const [category, setCategory] = useState('All');
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [saved, setSaved] = useState(false);
  const [index, setIndex] = useState(0);
  useEffect(() => { repo.favorites().then(setFavorites).catch(message); }, [revision]);
  const filtered = cards.filter(card => (category === 'All' || card.category === category) && (!saved || favorites.some(favorite => favorite.card_id === card.id)));
  const position = index % Math.max(1, filtered.length);
  const card = filtered[position];
  const isFavorite = !!card && favorites.some(favorite => favorite.card_id === card.id);
  const move = useCallback((direction: number) => {
    setIndex(value => (value + direction + filtered.length) % Math.max(1, filtered.length));
  }, [filtered.length]);
  async function toggleFavorite() {
    if (!card || !profile) return;
    try { await repo.toggleFavorite(profile.id, card.id); changed(); }
    catch (error) { message(error); }
  }
  const dateLabel = new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-u-nu-arab' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' }).format(fromDay(dayKey())).toUpperCase();
  const light = isLight(p);

  return <Page title="Motivation">
    <Segmented options={['discover', 'saved'] as const} value={saved ? 'saved' : 'discover'} onChange={value => { setSaved(value === 'saved'); setIndex(0); }} labels={{ discover: 'DISCOVER', saved: `SAVED · ${favorites.length}` }}/>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 6 }}>
      {categories.map(option => { const on = option === category; return <MotionPressable key={option} selected={on} pressScale={0.95} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { setCategory(option); setIndex(0); }} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? (light ? p.text : p.blue) : p.c8, borderWidth: 1, borderColor: on ? 'transparent' : p.c8Line }}><Text style={{ color: on ? (light ? '#FFFFFF' : '#0B1446') : p.text, fontFamily: fonts.bold, fontSize: 12 }}>{option}</Text></MotionPressable>; })}
    </ScrollView>

    {card ? <Animated.View key={card.id} entering={reduced ? undefined : FadeIn.duration(260)} exiting={reduced ? undefined : FadeOut.duration(140)} style={{ height: 400, borderRadius: 30, overflow: 'hidden', backgroundColor: light ? '#FFFFFF' : p.card, borderWidth: 1, borderColor: p.c8Line }}>
      <Svg pointerEvents="none" width="100%" height="100%" style={{ position: 'absolute' }}>
        <Defs><Pattern id="dots" width={14} height={14} patternUnits="userSpaceOnUse"><Circle cx={2} cy={2} r={1.1} fill={light ? 'rgba(29,46,143,0.16)' : 'rgba(156,203,255,0.14)'}/></Pattern></Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#dots)"/>
      </Svg>
      <View style={{ flex: 1, padding: 20, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase' }}>{card.category}</Text>
          <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8 }}>{String(position + 1).padStart(2, '0')} / {String(filtered.length).padStart(2, '0')}</Text>
        </View>
        <View style={{ gap: 16 }}>
          <View style={{ width: 72, height: 4, borderRadius: 2, backgroundColor: p.g1 }}/>
          <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 30, lineHeight: 32, letterSpacing: -0.6, textTransform: 'uppercase' }}>{card.text[language]}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8 }}>CUBYFIT</Text>
          <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8 }}>{dateLabel}</Text>
        </View>
      </View>
    </Animated.View> : <View style={{ height: 200, alignItems: 'center', justifyContent: 'center', borderRadius: 30, borderWidth: 1.5, borderStyle: 'dashed', borderColor: p.borderStrong }}><Text style={{ color: p.muted, fontFamily: fonts.semibold }}>{saved ? 'Save a card with the heart to see it here.' : 'No cards in this view.'}</Text></View>}

    {card && <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 6 }}>
      <CircleButton icon="chevron-back" size={52} label="Previous card" onPress={() => move(-1)}/>
      <CircleButton icon={isFavorite ? 'heart' : 'heart-outline'} tone={isFavorite ? 'accent' : 'plain'} size={52} label={isFavorite ? 'Remove favorite' : 'Save favorite'} onPress={() => { void toggleFavorite(); }}/>
      <CircleButton icon="share-outline" size={52} label="Share" onPress={() => { void Share.share({ message: card.text[language] }).catch(message); }}/>
      <CircleButton icon="chevron-forward" size={52} label="Next card" onPress={() => move(1)}/>
    </View>}
    {card && <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8, textAlign: 'center' }}>USE THE ARROWS TO BROWSE</Text>}
  </Page>;
}
