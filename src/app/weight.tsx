import React, { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { LayoutChangeEvent, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { addDays, dayKey, fromDay } from '../core/date';
import { weightGoalProgress, weightSummary } from '../core/logic';
import { Measurement, WeightEntry } from '../core/types';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { Button, Page, confirm, message } from '../ui/components';
import { Text } from '../ui/LocalizedText';
import { fonts } from '../ui/theme';
import { BottomSheet } from '../ui/BottomSheet';
import { CircleButton, EmptyAction, MiniBar, SectionLink, Segmented, StatTrio, useEntering, usePalette } from '../ui/voltKit';

type Range = '7' | '30' | '90';

/** Volt Weight: hero number, range selector, area chart, goal tiles and history. */
export default function Weight() {
  const { profile, revision, changed, language } = useApp();
  const p = usePalette();
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [period, setPeriod] = useState<Range>('30');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [entryMenu, setEntryMenu] = useState<{ kind: 'weight'; entry: WeightEntry } | { kind: 'measurement'; entry: Measurement } | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  useEffect(() => {
    Promise.all([repo.weights(), repo.measurements()]).then(([entries, records]) => { setWeights(entries); setMeasurements(records); }).catch(message);
  }, [revision]);

  const locale = language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-u-nu-arab' : 'en-US';
  const short = (day: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat(locale, options).format(fromDay(day));
  const summary = weightSummary(weights);
  const plotted = useMemo(() => weights.slice().sort((a, b) => a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at)), [weights]);
  const today = dayKey();
  const start = addDays(today, 1 - Number(period));
  const inPeriod = plotted.filter(entry => entry.day >= start && entry.day <= today);
  const highlightedIndex = Math.max(0, inPeriod.findIndex(entry => entry.id === selectedId));
  const highlighted = selectedId && inPeriod.some(entry => entry.id === selectedId) ? inPeriod[highlightedIndex] : inPeriod.at(-1);
  const highlightedPrev = highlighted ? inPeriod[inPeriod.indexOf(highlighted) - 1] : undefined;
  const periodChange = inPeriod.length > 1 ? +(inPeriod.at(-1)!.kg - inPeriod[0].kg).toFixed(1) : null;
  const progress = summary.latest && profile ? weightGoalProgress(profile.start_weight, summary.latest.kg, profile.target_weight) : null;
  const toGo = summary.latest && profile?.target_weight != null ? Math.abs(+(summary.latest.kg - profile.target_weight).toFixed(1)) : null;
  const sign = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}`;

  // Chart geometry (area + smooth line, y-axis on the right like the prototype).
  const H = 170, padTop = 10, padBottom = 10, axis = 30;
  const lo = inPeriod.length ? Math.floor(Math.min(...inPeriod.map(x => x.kg)) * 2) / 2 - 0.5 : 0;
  const hi = inPeriod.length ? Math.ceil(Math.max(...inPeriod.map(x => x.kg)) * 2) / 2 + 0.5 : 1;
  const plotW = Math.max(0, chartWidth - axis);
  const xy = inPeriod.map((entry, index) => ({ entry, x: index * plotW / Math.max(1, inPeriod.length - 1), y: padTop + (hi - entry.kg) * (H - padTop - padBottom) / Math.max(0.5, hi - lo) }));
  const line = xy.map((pt, index) => index === 0 ? `M${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : (() => { const prev = xy[index - 1]; const cx = (prev.x + pt.x) / 2; return `C${cx.toFixed(1)} ${prev.y.toFixed(1)} ${cx.toFixed(1)} ${pt.y.toFixed(1)} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`; })()).join('');
  const area = xy.length > 1 ? `${line}L${xy.at(-1)!.x.toFixed(1)} ${H}L0 ${H}Z` : '';
  const ticks = Array.from({ length: 5 }, (_, i) => +(lo + (hi - lo) * i / 4).toFixed(1));
  const selectedPoint = xy.find(pt => pt.entry === highlighted);
  const heroEntering = useEntering(0);

  return <Page title="Weight" headerAction={<CircleButton icon="add" tone="accent" label="Add weight or measurement" onPress={() => setAdding(true)}/>}>
    <Animated.View entering={heroEntering}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
        <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 88, lineHeight: 86, letterSpacing: -4, includeFontPadding: false }}>{summary.latest ? summary.latest.kg.toFixed(1) : '—'}</Text>
        <Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 13, letterSpacing: 1, marginBottom: 14 }}>KG</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <Ionicons name="arrow-forward" size={13} color={p.accent}/>
        <Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 12 }}>{summary.change === null ? 'Add two entries to see your change' : `${sign(summary.change)} kg since start`}</Text>
        {periodChange !== null && <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', marginLeft: 8 }}>{sign(periodChange)} kg in {period}d</Text>}
      </View>
    </Animated.View>

    <View style={{ marginTop: 8 }}><Segmented options={['7', '30', '90'] as const} value={period} onChange={value => { setPeriod(value); setSelectedId(null); }} labels={{ '7': '7D', '30': '30D', '90': '90D' }}/></View>

    {inPeriod.length > 1 && highlighted ? <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 8 }}>
        <View><Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase' }}>{short(highlighted.day, { weekday: 'short', day: 'numeric', month: 'short' })}</Text><Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 18, marginTop: 4 }}>{highlighted.kg} kg</Text></View>
        {highlightedPrev && <Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 12 }}>{sign(highlighted.kg - highlightedPrev.kg)} kg vs prev</Text>}
      </View>
      <View onLayout={(event: LayoutChangeEvent) => setChartWidth(event.nativeEvent.layout.width)} style={{ height: H + 22, marginTop: 10 }}>
        {chartWidth > 0 && <Svg width={chartWidth} height={H + 22} accessibilityLabel="Weight history chart">
          <Defs><LinearGradient id="wfill" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={p.pgBar} stopOpacity={0.22}/><Stop offset="1" stopColor={p.pgBar} stopOpacity={0}/></LinearGradient></Defs>
          {ticks.map(tick => { const y = padTop + (hi - tick) * (H - padTop - padBottom) / Math.max(0.5, hi - lo); return <React.Fragment key={tick}><Line x1={0} x2={plotW} y1={y} y2={y} stroke={p.border} strokeWidth={1}/><SvgText x={chartWidth} y={y + 3} textAnchor="end" fill={p.muted} fontSize={9.5} fontFamily={fonts.semibold}>{tick.toFixed(1)}</SvgText></React.Fragment>; })}
          <Path d={area} fill="url(#wfill)"/>
          <Path d={line} fill="none" stroke={p.pgBar} strokeWidth={2.6} strokeLinecap="round"/>
          {selectedPoint && <Line x1={selectedPoint.x} x2={selectedPoint.x} y1={0} y2={H} stroke={p.borderStrong} strokeDasharray="3 4"/>}
          {selectedPoint && <Circle cx={selectedPoint.x} cy={selectedPoint.y} r={6} fill={p.c8} stroke={p.pgBar} strokeWidth={3}/>}
          {xy.map(pt => <Circle key={pt.entry.id} cx={pt.x} cy={pt.y} r={14} fill="transparent" onPress={() => setSelectedId(pt.entry.id)}/>)}
          {[0, Math.floor((inPeriod.length - 1) / 2), inPeriod.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(index => <SvgText key={index} x={xy[index].x} y={H + 18} textAnchor={index === 0 ? 'start' : index === inPeriod.length - 1 ? 'end' : 'middle'} fill={p.muted} fontSize={9.5} fontFamily={fonts.semibold}>{short(inPeriod[index].day).toUpperCase()}</SvgText>)}
        </Svg>}
      </View>
    </View> : <EmptyAction text={inPeriod.length ? 'Add another entry in this period to draw a trend.' : 'No weight entries in this period.'} onPress={() => router.push('/weight-form')}/>}

    {progress !== null && <View style={{ marginTop: 10, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}><Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase' }}>Progress to goal</Text><Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 26, lineHeight: 28 }}>{progress}%</Text></View>
      <MiniBar value={progress / 100} color={p.pgBar} track={p.qTrack} height={6}/>
    </View>}
    <View style={{ marginTop: 6 }}><StatTrio items={[{ label: 'Start', value: summary.first ? summary.first.kg.toFixed(1) : profile ? profile.start_weight.toFixed(1) : '—' }, { label: 'Target', value: profile?.target_weight != null ? profile.target_weight.toFixed(1) : 'Not set' }, { label: 'To go', value: toGo !== null ? toGo.toFixed(1) : '—' }]}/></View>

    <SectionLink title="Weigh-ins" right={<Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12 }}>{weights.length} total</Text>}/>
    {weights.length ? <View>{weights.map((entry, index) => {
      const previous = weights[index + 1];
      const diff = previous ? +(entry.kg - previous.kg).toFixed(1) : null;
      return <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={`${entry.day}, ${entry.kg} kilograms. Edit or delete`} onPress={() => setEntryMenu({ kind: 'weight', entry })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: p.border }}>
        <View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' }}>{entry.day === today ? 'Today' : short(entry.day, { weekday: 'short', day: 'numeric', month: 'short' })}</Text>{!!entry.note && <Text numberOfLines={1} style={{ color: p.muted, fontSize: 12, marginTop: 2 }}>{entry.note}</Text>}</View>
        {diff !== null && <Text style={{ color: diff <= 0 ? p.accent : p.muted, fontFamily: fonts.bold, fontSize: 12 }}>{sign(diff)}</Text>}
        <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 17 }}>{entry.kg} kg</Text>
      </Pressable>;
    })}</View> : <EmptyAction text="Log your first weigh-in." onPress={() => router.push('/weight-form')}/>}

    <SectionLink title="Body measurements" right={<CircleButton icon="add" tone="accent" size={30} label="Add measurement" onPress={() => router.push('/measurement-form')}/>}/>
    {measurements.length ? <View>{measurements.map(measurement => <Pressable key={measurement.id} accessibilityRole="button" accessibilityLabel={`${measurement.type} ${measurement.value} ${measurement.unit}. Edit or delete`} onPress={() => setEntryMenu({ kind: 'measurement', entry: measurement })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: p.border }}>
      <View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 14 }}>{measurement.type}</Text><Text style={{ color: p.muted, fontSize: 12 }}>{short(measurement.day, { weekday: 'short', day: 'numeric', month: 'short' })}</Text></View>
      <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 17 }}>{measurement.value} {measurement.unit}</Text>
    </Pressable>)}</View> : <EmptyAction text="No body measurements yet." onPress={() => router.push('/measurement-form')}/>}

    <BottomSheet visible={adding} title="Add" onClose={() => setAdding(false)}>{close => <><Button title="Add weight" onPress={() => close(() => router.push('/weight-form'))}/><Button title="Add measurement" kind="ghost" onPress={() => close(() => router.push('/measurement-form'))}/></>}</BottomSheet>
    <BottomSheet visible={!!entryMenu} title={entryMenu?.kind === 'measurement' ? 'Measurement' : 'Weigh-in'} onClose={() => setEntryMenu(null)}>{close => entryMenu && <View style={{ gap: 10 }}>
      <Button title="Edit" onPress={() => close(() => entryMenu.kind === 'weight' ? router.push({ pathname: '/weight-form', params: { id: entryMenu.entry.id } }) : router.push({ pathname: '/measurement-form', params: { id: entryMenu.entry.id } }))}/>
      <Button title="Delete" kind="danger" onPress={() => confirm(entryMenu.kind === 'weight' ? 'Delete weight entry?' : 'Delete measurement?', async () => { await repo.remove(entryMenu.kind === 'weight' ? 'weights' : 'measurements', entryMenu.entry.id); close(); changed(); })}/>
    </View>}</BottomSheet>
  </Page>;
}
