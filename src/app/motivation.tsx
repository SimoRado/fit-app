import React, { useCallback, useEffect, useState } from 'react';
import { Share, View } from 'react-native';
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
    <Card><Text style={styles.muted}>Today&apos;s featured card</Text><Text style={{ color: colors.text, fontFamily: fonts.display, fontWeight: '800', fontSize: 25, lineHeight: 30 }}>{featured.text[language]}</Text></Card>
    <Choices label="Category" options={['All', 'Discipline', 'Fitness', 'Consistency', 'Confidence', 'Productivity', 'Personal Growth']} value={category} onChange={value => { setCategory(value); setIndex(0); }}/>
    <Button title={saved ? 'Show all cards' : 'Show favorites'} kind="ghost" onPress={() => { setSaved(!saved); setIndex(0); }}/>
    <SectionHeader title="Motivation"/>
    {card ? <>
      <MotivationCard category={card.category} text={card.text[language]} onMove={move}/>
      <View style={styles.row}><Text style={styles.muted}>{card.category} · {index % filtered.length + 1}/{filtered.length}</Text><FavoriteButton selected={favorites.some(favorite => favorite.card_id === card.id)} onPress={toggleFavorite}/></View>
      <View style={styles.row}><Button title="Previous" kind="ghost" onPress={() => move(-1)}/><Button title="Next" kind="ghost" onPress={() => move(1)}/><Button title="Share" kind="ghost" onPress={async () => { await Share.share({ message: card.text[language] }); }}/></View>
    </> : <Text style={styles.muted}>No cards in this view.</Text>}
  </Page>;
}
