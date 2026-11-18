import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, Share, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type Svg from 'react-native-svg';
import { Text } from '../ui/LocalizedText';
import { catalogIds, inCategory, motivationCard, motivationCategories, type CardLanguage, type MotivationCard } from '../core/motivationCatalog';
import { type DeckState, visibleIds } from '../core/motivationDeck';
import { dayKey, fromDay } from '../core/date';
import { motivationStore } from '../data/motivationStore';
import { useApp } from '../state/app';
import { useSubscription } from '../state/subscriptions';
import { canShareFiles, shareFile, writePng } from '../services/shareImage';
import { Page, message } from '../ui/components';
import { fonts, brand } from '../ui/theme';
import { useReducedMotion } from '../ui/motion';
import { MotionPressable } from '../ui/MotionPressable';
import { CircleButton, Segmented, isLight, usePalette } from '../ui/voltKit';
import { MotivationCardFace } from '../ui/motivation/MotivationCardFace';
import { EndOfDeckCard } from '../ui/motivation/EndOfDeckCard';
import { HeartButton, SavedLibrary } from '../ui/motivation/SavedLibrary';
import { SwipeDeck, type SwipeDeckHandle } from '../ui/motivation/SwipeDeck';
import { CARD_SHARE_HEIGHT, CARD_SHARE_WIDTH, MotivationShareCard } from '../ui/motivation/MotivationShareCard';

const categories = ['All', ...motivationCategories] as const;
const RATIO = 5.4 / 4; // prototype `.stage { aspect-ratio: 4 / 5.4 }`
const END = '__end__';
/** Where the user was in each day's deck, for this app session (switching tabs keeps the card). */
const lastPosition = new Map<string, number>();

/** Volt Motivation: Discover deck (daily Free 3 / Pro 10 cards) and the Saved library. */
export default function Motivation() {
  const { profile, language, revision } = useApp();
  const subscription = useSubscription();
  const isPro = subscription.isPremium; // live RevenueCat entitlement; never a stored flag
  const p = usePalette();
  const light = isLight(p);
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const lang = language as CardLanguage;
  const ownerId = profile?.id ?? null;

  const [view, setView] = useState<'discover' | 'saved'>('discover');
  const [category, setCategory] = useState<string>('All');
  const [today, setToday] = useState(() => dayKey());
  const [deck, setDeck] = useState<DeckState | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [shareCard, setShareCard] = useState<MotivationCard | null>(null);
  const shareRef = useRef<Svg>(null);
  const deckRef = useRef<SwipeDeckHandle>(null);

  // Day boundary: re-check the local date whenever the screen gains focus or the app returns to the
  // foreground, plus a timer for the moment of midnight while it stays open. No reroll otherwise.
  const checkDay = useCallback(() => setToday(current => { const now = dayKey(); return now === current ? current : now; }), []);
  useFocusEffect(checkDay);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state === 'active') checkDay(); });
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2).getTime() - now.getTime();
    const timer = setTimeout(checkDay, midnight);
    return () => { listener.remove(); clearTimeout(timer); };
  }, [checkDay, today]);

  useEffect(() => {
    if (!ownerId) return;
    let live = true;
    motivationStore.deck(ownerId, today, catalogIds()).then(next => { if (live) setDeck(next); }).catch(message);
    return () => { live = false; };
  }, [ownerId, today, revision]);
  useEffect(() => {
    if (!ownerId) return;
    let live = true;
    motivationStore.favorites(ownerId).then(ids => { if (live) setSaved(ids); }).catch(message);
    return () => { live = false; };
  }, [ownerId, revision]);

  const savedSet = useMemo(() => new Set(saved), [saved]);
  const savedCards = useMemo(() => saved.map(motivationCard).filter((item): item is MotivationCard => !!item), [saved]);
  const dailyCards = useMemo(() => deck && deck.day === today ? visibleIds(deck, isPro).map(motivationCard).filter((item): item is MotivationCard => !!item) : [], [deck, today, isPro]);
  const cards = useMemo(() => dailyCards.filter(item => inCategory(item, category)), [dailyCards, category]);
  const deckKey = `${ownerId}|${today}|${category}`;
  // The index belongs to one deck (account + day + filter); a new deck starts where it was left.
  const [position, setPosition] = useState({ key: deckKey, index: lastPosition.get(deckKey) ?? 0 });
  const index = position.key === deckKey ? position.index : lastPosition.get(deckKey) ?? 0;
  const onIndexChange = useCallback((next: number) => { lastPosition.set(deckKey, next); setPosition({ key: deckKey, index: next }); }, [deckKey]);
  const atEnd = index >= cards.length;
  const current = atEnd ? null : cards[index];

  // Favorites: optimistic, idempotent writes queued per tap so rapid taps keep their order.
  const queue = useRef(Promise.resolve());
  const toggleSaved = useCallback((item: MotivationCard) => {
    if (!ownerId) return;
    const next = !savedSet.has(item.id);
    setSaved(list => next ? [item.id, ...list.filter(id => id !== item.id)] : list.filter(id => id !== item.id));
    queue.current = queue.current.then(() => motivationStore.setFavorite(ownerId, item.id, next)).catch(error => {
      setSaved(list => next ? list.filter(id => id !== item.id) : [item.id, ...list]);
      message(error);
    });
  }, [ownerId, savedSet]);

  // Share: a locally rendered PNG through the native share sheet when available; text otherwise.
  const share = useCallback(async (item: MotivationCard) => {
    if (canShareFiles()) { setShareCard(item); return; }
    try { await Share.share({ message: `${item.text[lang]}\n\n— Cubyfit` }); } catch (error) { message(error); }
  }, [lang]);
  useEffect(() => {
    if (!shareCard) return;
    let live = true;
    const frame = setTimeout(() => {
      const svg = shareRef.current;
      if (!svg) { setShareCard(null); return; }
      new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('The image took too long to generate.')), 8000);
        svg.toDataURL(data => { clearTimeout(timer); resolve(data); }, { width: CARD_SHARE_WIDTH, height: CARD_SHARE_HEIGHT });
      })
        .then(base64 => writePng(base64, `cubyfit-card-${shareCard.id}.png`))
        .then(uri => shareFile(uri, 'Cubyfit'))
        .catch(message)
        .finally(() => { if (live) setShareCard(null); });
    }, 60);
    return () => { live = false; clearTimeout(frame); };
  }, [shareCard]);

  // Card size: the prototype's 4:5.4 card, capped at 360 pt wide and shrunk on short screens so
  // the controls never fall below the fold.
  const contentWidth = Math.min(windowWidth, 620) - 36;
  const available = windowHeight - insets.top - Math.max(insets.bottom, 16) - 312;
  const cardWidth = Math.round(Math.max(220, Math.min(contentWidth, 360, available / RATIO)));
  const cardHeight = Math.round(cardWidth * RATIO);
  const dateLabel = new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-u-nu-arab' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' }).format(fromDay(today)).replace(/,/g, '').toUpperCase();

  const keyFor = useCallback((i: number) => i >= cards.length ? END : cards[i].id, [cards]);
  const renderCard = useCallback((i: number) => i >= cards.length
    ? <EndOfDeckCard width={cardWidth} height={cardHeight} seen={cards.length} isPro={isPro}/>
    : <MotivationCardFace card={cards[i]} language={lang} width={cardWidth} height={cardHeight} position={{ index: i, total: cards.length }} dateLabel={dateLabel}/>, [cards, cardWidth, cardHeight, isPro, lang, dateLabel]);

  const segmented = <Segmented options={['discover', 'saved'] as const} value={view} onChange={setView} labels={{ discover: 'DISCOVER', saved: `${language === 'en' ? 'SAVED' : language === 'fr' ? 'ENREGISTRÉES' : 'المحفوظة'} · ${savedCards.length}` }}/>;

  return <Page title="Motivation">
    {segmented}
    {view === 'saved'
      ? <Animated.View key="saved" entering={reduced ? undefined : FadeIn.duration(220)}>
        <SavedLibrary cards={savedCards} language={lang} contentWidth={contentWidth} savedIds={savedSet} onToggleSaved={toggleSaved} onShare={item => { void share(item); }} onBrowse={() => setView('discover')}/>
      </Animated.View>
      : <Animated.View key="discover" entering={reduced ? undefined : FadeIn.duration(220)} style={{ gap: 14 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 6 }}>
          {categories.map(option => { const on = option === category; return <MotionPressable key={option} selected={on} pressScale={0.95} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setCategory(option)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? (light ? p.text : p.blue) : p.c8, borderWidth: 1, borderColor: on ? 'transparent' : p.c8Line }}><Text style={{ color: on ? (light ? '#FFFFFF' : brand.ink) : p.text, fontFamily: fonts.bold, fontSize: 12 }}>{option}</Text></MotionPressable>; })}
        </ScrollView>

        <View style={{ width: cardWidth, height: cardHeight + 14, alignSelf: 'center' }}>
          {!deck ? <View style={{ width: cardWidth, height: cardHeight, borderRadius: 28, backgroundColor: light ? '#FFFFFF' : p.card, borderWidth: 1, borderColor: p.c8Line, opacity: 0.6 }}/>
            : cards.length === 0 ? <EmptyCategory width={cardWidth} height={cardHeight} onReset={() => setCategory('All')}/>
            : <SwipeDeck key={deckKey} ref={deckRef} count={cards.length + 1} initialIndex={Math.min(index, cards.length)} width={cardWidth} height={cardHeight} reducedMotion={reduced}
              keyFor={keyFor} renderCard={renderCard} onIndexChange={onIndexChange} surface={light ? '#FFFFFF' : p.card} accessibilityLabel="Today’s motivation cards. Swipe or use the arrow buttons."/>}
        </View>

        {cards.length > 0 && <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
          <CircleButton icon="chevron-back" size={52} label="Previous card" disabled={index <= 0} onPress={() => deckRef.current?.go(-1)}/>
          <HeartButton saved={!!current && savedSet.has(current.id)} cardKey={current?.id ?? END} disabled={!current} onPress={() => { if (current) toggleSaved(current); }}/>
          <CircleButton icon="share-outline" size={52} label="Share card" disabled={!current || !!shareCard} onPress={() => { if (current) void share(current); }}/>
          <CircleButton icon="chevron-forward" size={52} label="Next card" disabled={atEnd} onPress={() => deckRef.current?.go(1)}/>
        </View>}
        {cards.length > 0 && (atEnd && !isPro
          ? <MotionPressable pressScale={0.97} accessibilityRole="button" onPress={() => router.push('/paywall')} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: light ? p.softLime : p.soft2 }}>
            <Text style={{ color: light ? p.accent : p.g1, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.3 }}>Unlock 10 cards a day</Text>
          </MotionPressable>
          : <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8, textAlign: 'center' }}>SWIPE THE CARD OR USE THE ARROWS</Text>)}
      </Animated.View>}

    {/* Off-screen poster used only while an image share is being generated. */}
    {shareCard && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, opacity: 0 }}>
      <MotivationShareCard ref={shareRef} card={shareCard} language={lang} width={216}/>
    </View>}
  </Page>;
}

function EmptyCategory({ width, height, onReset }: { width: number; height: number; onReset: () => void }) {
  const p = usePalette();
  return <View style={{ width, height, borderRadius: 28, borderWidth: 1.5, borderStyle: 'dashed', borderColor: p.borderStrong, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 28 }}>
    <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 18, textAlign: 'center' }}>No card from this category today.</Text>
    <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 19, textAlign: 'center' }}>Your daily cards are chosen from every category. Try All, or come back tomorrow.</Text>
    <MotionPressable pressScale={0.96} accessibilityRole="button" onPress={onReset} style={{ marginTop: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: p.g1 }}>
      <Text style={{ color: p.plInk, fontFamily: fonts.bold, fontSize: 13 }}>Show all</Text>
    </MotionPressable>
  </View>;
}
