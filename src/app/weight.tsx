import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { TapPressable as Pressable } from '../ui/MotionPressable';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { dayKey } from '../core/date';
import { dailyWeights, pointsInWindow, windowStart } from '../core/weightChart';
import { todaysWeightEntry, weightGoal } from '../core/weightPolicy';
import { effectiveWeightRange, isProWeightRange, proStatus, weightRangeDays, weightRangeTap, weightRanges, freeFallbackRange, type WeightRangeKey } from '../core/proAccess';
import { Measurement, WeightEntry } from '../core/types';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { useSubscription } from '../state/subscriptions';
import { Button, Page, confirm, message } from '../ui/components';
import { useLoadState } from '../state/useLoadState';
import { LoadError, SkeletonBlock, SkeletonCard, SkeletonRow, SkeletonScreen } from '../ui/Skeleton';
import { Text } from '../ui/LocalizedText';
import { fonts } from '../ui/theme';
import { BottomSheet } from '../ui/BottomSheet';
import { WeightChart } from '../ui/WeightChart';
import { axisLabel, localeFor, shortDay } from '../ui/dates';
import { CircleButton, EmptyAction, MiniBar, Segmented, StatTrio, useEntering, usePalette } from '../ui/voltKit';

const sign = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}`;
const HISTORY_PREVIEW = 14;

/**
 * Weight: current value, 7D/30D/90D chart, goal progress and the weigh-in
 * history. Only today's weigh-in can be added or edited; earlier ones are
 * read-only (enforced again in the repository, see core/weightPolicy).
 *
 * 7D and 30D are free; 90D needs the live RevenueCat Pro entitlement (core/proAccess). A Free tap
 * on 90D opens the paywall and keeps the current range; losing Pro while on 90D falls back to 30D.
 * Only the chart range is gated — every weigh-in stays visible in the history below.
 */
export default function Weight() {
  const { profile, revision, changed, language } = useApp();
  const p = usePalette();
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const subscription = useSubscription();
  const [selectedRange, setSelectedRange] = useState<WeightRangeKey>(freeFallbackRange);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [measurementMenu, setMeasurementMenu] = useState<Measurement | null>(null);
  // First read only: until it completes, no "—" weight or empty history is shown as if it were real.
  const load = useLoadState();
  const { attempt, succeed, fail } = load;
  useEffect(() => {
    let active = true;
    Promise.all([repo.weights(), repo.measurements()]).then(([entries, records]) => { if (!active) return; setWeights(entries); setMeasurements(records); succeed(); }).catch(error => { if (active && !fail()) message(error); });
    return () => { active = false; };
  }, [revision, attempt, succeed, fail]);

  // Never render a Pro range without an active entitlement (restored state, expiry, still loading).
  const range = effectiveWeightRange(selectedRange, subscription);
  const days = weightRangeDays[range];
  const status = proStatus(subscription);
  useEffect(() => {
    // Entitlement resolved as Free (expired / revoked): drop the Pro selection for good.
    if (status === 'free' && selectedRange !== range) { setSelectedRange(range); setSelectedId(null); }
  }, [status, selectedRange, range]);
  const pickRange = (next: WeightRangeKey) => {
    if (weightRangeTap(next, subscription) === 'paywall') { router.push('/paywall'); return; }
    setSelectedRange(next); setSelectedId(null);
  };
  const locked = status === 'pro' ? {} : Object.fromEntries(weightRanges.filter(isProWeightRange).map(key => [key, 'lock-closed' as const]));
  const lockedHints = status === 'pro' ? {} : Object.fromEntries(weightRanges.filter(isProWeightRange).map(key => [key, 'Cubyfit Pro feature. Opens Cubyfit Pro plans']));

  const locale = localeFor(language);
  const today = dayKey();
  const daily = dailyWeights(weights);
  const latest = daily.at(-1);
  const todayEntry = todaysWeightEntry(weights, today);
  const start = windowStart(today, days);
  const inPeriod = pointsInWindow(daily, start, today);
  const highlighted = inPeriod.find(point => point.id === selectedId) ?? inPeriod.at(-1);
  const highlightedPrev = highlighted ? daily[daily.indexOf(highlighted) - 1] : undefined;
  const periodChange = inPeriod.length > 1 ? +(inPeriod.at(-1)!.kg - inPeriod[0].kg).toFixed(1) : null;
  const startWeight = profile?.start_weight ?? null;
  const goal = latest && startWeight !== null ? weightGoal(startWeight, latest.kg, profile?.target_weight) : null;
  const heroEntering = useEntering(0);
  const editLabel = todayEntry ? 'Edit today’s weight' : 'Add today’s weight';
  const openToday = () => router.push('/weight-form');
  const history = showAll ? weights : weights.slice(0, HISTORY_PREVIEW);

  if (load.status !== 'ready') return <Page title="Weight">
    {load.status === 'error' ? <LoadError text="Could not load your weight history." onRetry={load.retry}/> : <SkeletonScreen label="Loading weight history">
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}><SkeletonBlock width={170} height={80} radius={16}/><SkeletonBlock width={26} height={12} radius={6} style={{ marginBottom: 14 }}/></View>
      <SkeletonBlock width="55%" height={12} radius={6}/>
      <SkeletonCard style={{ gap: 12 }}><View style={{ flexDirection: 'row', gap: 18 }}>{[0, 1, 2].map(index => <SkeletonBlock key={index} width={44} height={12} radius={6}/>)}</View><SkeletonBlock height={170} radius={14}/></SkeletonCard>
      <View style={{ gap: 8 }}>{[0, 1, 2].map(index => <SkeletonRow key={index}/>)}</View>
    </SkeletonScreen>}
  </Page>;

  return <Page title="Weight" headerAction={<CircleButton icon="add" tone="accent" label="Add weight or measurement" onPress={() => setAdding(true)}/>}>
    <Animated.View entering={heroEntering}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
        <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 96, lineHeight: 92, letterSpacing: -3.4, includeFontPadding: false }}>{latest ? latest.kg.toFixed(1) : '—'}</Text>
        <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 14, letterSpacing: 1.4, marginBottom: 14 }}>KG</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <Ionicons name="arrow-forward" size={13} color={p.accent}/>
        <Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 12 }}>{goal && latest && daily.length > 1 ? `${sign(goal.change)} kg since start` : latest ? 'Starting point recorded' : 'Add your first weigh-in'}</Text>
        {periodChange !== null && <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase', marginLeft: 8 }}>{sign(periodChange)} kg in {days}d</Text>}
      </View>
    </Animated.View>

    <View style={{ marginTop: 10 }}><Segmented options={weightRanges} value={range} onChange={pickRange} icons={locked} hints={lockedHints}/></View>

    {highlighted ? <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 14 }}>
        <View><Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase' }}>{shortDay(locale, highlighted.day)}</Text><Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 19, marginTop: 4 }}>{highlighted.kg.toFixed(1)} kg</Text></View>
        {highlightedPrev && <Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 12 }}>{sign(highlighted.kg - highlightedPrev.kg)} kg vs prev</Text>}
      </View>
      <View style={{ marginTop: 16, marginBottom: 4 }}>
        <WeightChart points={inPeriod} range={days} start={start} end={today} selectedId={highlighted.id} onSelect={setSelectedId} formatTick={tick => axisLabel(locale, tick)}
          accessibilityLabel={`Weight over the last ${days} days: ${inPeriod.length} weigh-in${inPeriod.length === 1 ? '' : 's'}, latest ${highlighted.kg} kilograms`}/>
      </View>
      {inPeriod.length === 1 && <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12, textAlign: 'center' }}>One weigh-in in this period. Add more to see a trend.</Text>}
    </View> : <View style={{ marginTop: 14 }}><EmptyAction text={weights.length ? `No weigh-ins in the last ${days} days.` : 'No weigh-ins yet. Add today’s weight to start your chart.'} icon="analytics-outline" onPress={openToday}/></View>}

    {/* .goal + .gbar */}
    <View style={{ marginTop: 24, marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase' }}>Progress to goal</Text>
        <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 28, lineHeight: 30 }}>{goal?.progress != null ? `${goal.progress}%` : '—'}</Text>
      </View>
      <View style={{ marginTop: 12 }}><MiniBar value={(goal?.progress ?? 0) / 100} color={p.accent} track={p.soft1} height={8}/></View>
      {goal?.movingAway && <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12, marginTop: 8 }}>Currently {sign(goal.change)} kg from your starting weight, away from your target.</Text>}
      {goal?.reached && <Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 12, marginTop: 8 }}>Target reached.</Text>}
      {profile?.target_weight == null && <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12, marginTop: 8 }}>Set a target weight in your profile to track progress.</Text>}
    </View>
    <StatTrio items={[
      { label: 'Start', value: startWeight !== null ? startWeight.toFixed(1) : '—' },
      { label: 'Target', value: profile?.target_weight != null ? profile.target_weight.toFixed(1) : 'Not set' },
      { label: 'To go', value: goal?.toGo != null ? goal.toGo.toFixed(1) : '—' },
    ]}/>

    {/* .sec — weigh-in history (read-only except today) */}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 30, marginBottom: 2 }}>
      <Text accessibilityRole="header" style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 19, letterSpacing: -0.35 }}>Measurements</Text>
      {weights.length > 0 && <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12 }}>{weights.length} total</Text>}
    </View>
    {weights.length ? <View>
      {history.map((entry, index) => {
        const previous = weights[index + 1];
        const diff = previous ? +(entry.kg - previous.kg).toFixed(1) : null;
        const isToday = entry.id === todayEntry?.id;
        const label = entry.day === today ? 'Today' : shortDay(locale, entry.day);
        const body = <>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase' }}>{label}</Text>
            {!!entry.note && <Text numberOfLines={1} style={{ color: p.subtle, fontFamily: fonts.medium, fontSize: 12, marginTop: 3 }}>{entry.note}</Text>}
          </View>
          {diff !== null && <Text style={{ color: diff < 0 ? p.accent : p.muted, fontFamily: fonts.bold, fontSize: 12, marginRight: 12 }}>{diff === 0 ? '0.0' : sign(diff)}</Text>}
          <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 19.2 }}>{entry.kg.toFixed(1)} kg</Text>
          {isToday && <Ionicons name="create-outline" size={15} color={p.accent} style={{ marginLeft: 8 }}/>}
        </>;
        const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: 48, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: p.border };
        // Only today's row is interactive; history rows are plain text.
        return isToday
          ? <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={`Today, ${entry.kg} kilograms. Edit today's weight`} onPress={openToday} style={rowStyle}>{body}</Pressable>
          : <View key={entry.id} accessible accessibilityLabel={`${label}, ${entry.kg} kilograms${diff !== null ? `, ${sign(diff)} from previous` : ''}`} style={rowStyle}>{body}</View>;
      })}
      {weights.length > HISTORY_PREVIEW && <Pressable accessibilityRole="button" onPress={() => setShowAll(value => !value)} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 12.5 }}>{showAll ? 'Show fewer' : `Show all ${weights.length}`}</Text></Pressable>}
    </View> : <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 13, marginTop: 6 }}>Your weigh-ins will appear here.</Text>}

    <View style={{ marginTop: 18 }}><Button title={todayEntry ? `Edit today’s entry` : '+  Add entry'} onPress={openToday}/></View>

    {/* Body measurements (waist, hips, …) keep their own add/edit/delete. */}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 30, marginBottom: 2 }}>
      <Text accessibilityRole="header" style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 17, letterSpacing: -0.35 }}>Body measurements</Text>
      <CircleButton icon="add" tone="accent" size={30} label="Add measurement" onPress={() => router.push('/measurement-form')}/>
    </View>
    {measurements.length ? <View>{measurements.map(measurement => <Pressable key={measurement.id} accessibilityRole="button" accessibilityLabel={`${measurement.type} ${measurement.value} ${measurement.unit}. Edit or delete`} onPress={() => setMeasurementMenu(measurement)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: p.border }}>
      <View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 14 }}>{measurement.type}</Text><Text style={{ color: p.muted, fontSize: 12 }}>{shortDay(locale, measurement.day)}</Text></View>
      <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 17 }}>{measurement.value} {measurement.unit}</Text>
    </Pressable>)}</View> : <EmptyAction text="No body measurements yet." onPress={() => router.push('/measurement-form')}/>}

    <BottomSheet visible={adding} title="Add" onClose={() => setAdding(false)}>{close => <>
      <Button title={editLabel} onPress={() => close(openToday)}/>
      <Button title="Add body measurement" kind="ghost" onPress={() => close(() => router.push('/measurement-form'))}/>
      <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12, textAlign: 'center' }}>Earlier weigh-ins are kept as read-only history.</Text>
    </>}</BottomSheet>
    <BottomSheet visible={!!measurementMenu} title="Measurement" onClose={() => setMeasurementMenu(null)}>{close => measurementMenu && <View style={{ gap: 10 }}>
      <Button title="Edit" onPress={() => close(() => router.push({ pathname: '/measurement-form', params: { id: measurementMenu.id } }))}/>
      <Button title="Delete" kind="danger" onPress={() => confirm('Delete measurement?', async () => { await repo.remove('measurements', measurementMenu.id); close(); changed(); })}/>
    </View>}</BottomSheet>
  </Page>;
}
