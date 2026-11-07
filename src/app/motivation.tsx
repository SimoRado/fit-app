import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { Text } from '../ui/LocalizedText';
import { cards } from '../core/cards';
import { Favorite } from '../core/types';
import { dayKey } from '../core/date';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { Button, Card, Choices, Page, styles, message } from '../ui/components';
import { FavoriteButton, MotivationCard, SectionHeader } from '../ui/visuals';
import { colors, fonts } from '../ui/theme';

export default function Motivation() {
  const { profile, language, revision, changed } = useApp();
  const [category, setCategory] = useState('All');
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [saved, setSaved] = useState(false);
  const [index, setIndex] = useState(0);
  useEffect(() => { repo.favorites().then(setFavorites).catch(message); }, [revision]);
  const filtered = cards.filter(card => (category === 'All' || card.category === category) && (!saved || favorites.some(favorite => favorite.card_id === card.id)));
  const card = filtered[index % Math.max(1, filtered.length)];
  const featured = cards[Math.floor(Number(dayKey().replaceAll('-', ''))) % cards.length];
  const move = useCallback((direction: number) => {
    setIndex(value => (value + direction + filtered.length) % Math.max(1, filtered.length));
  }, [filtered.length]);
  async function toggleFavorite() {
    if (!card || !profile) return;
    try { await repo.toggleFavorite(profile.id, card.id); changed(); }
    catch (error) { message(error); }
  }

  return <Page title="Motivation">
    <View style={{ flexDirection: 'row', backgroundColor: colors.card2, borderRadius: 999, padding: 4 }}>{[false, true].map(showSaved => <Pressable key={String(showSaved)} accessibilityRole="tab" accessibilityState={{ selected: saved === showSaved }} onPress={() => { setSaved(showSaved); setIndex(0); }} style={{ flex: 1, minHeight: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: saved === showSaved ? colors.card : 'transparent' }}><Text style={{ color: saved === showSaved ? colors.ink : colors.muted, fontFamily: fonts.bold, fontSize: 12 }}>{showSaved ? 'Saved' : 'Discover'}</Text></Pressable>)}</View>
    <Choices label="Category" options={['All', 'Discipline', 'Fitness', 'Consistency', 'Confidence', 'Productivity', 'Personal Growth']} value={category} onChange={value => { setCategory(value); setIndex(0); }}/>
    {card ? <>
      <MotivationCard category={card.category} text={card.text[language]} onMove={move}/>
      <View style={styles.row}><Text style={styles.muted}>{card.category} · {index % filtered.length + 1}/{filtered.length}</Text><FavoriteButton selected={favorites.some(favorite => favorite.card_id === card.id)} onPress={toggleFavorite}/></View>
      <View style={styles.row}><Button title="Previous" kind="ghost" onPress={() => move(-1)}/><Button title="Next" kind="ghost" onPress={() => move(1)}/><Button title="Share" kind="ghost" onPress={async () => { await Share.share({ message: card.text[language] }); }}/></View>
    </> : <Text style={styles.muted}>No cards in this view.</Text>}
    <SectionHeader title="Today&apos;s featured card"/>
    <Card><Text style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 25, lineHeight: 30 }}>{featured.text[language]}</Text></Card>
  </Page>;
}
