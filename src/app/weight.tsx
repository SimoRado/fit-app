import React, { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, G, Line, Polyline } from 'react-native-svg';
import { addDays, dayKey } from '../core/date';
import { weightGoalProgress, weightSummary } from '../core/logic';
import { Measurement, WeightEntry } from '../core/types';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { Button, Card, Choices, Empty, Page, styles, confirm, message } from '../ui/components';
import { Text } from '../ui/LocalizedText';
import { colors, fonts } from '../ui/theme';
import { ProgressBar, SectionHeader } from '../ui/visuals';
import { BottomSheet } from '../ui/BottomSheet';
import { DisplayMetric } from '../ui/DisplayMetric';

export default function Weight() {
  const { profile, revision, changed } = useApp();
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [period, setPeriod] = useState<'7' | '30' | '90'>('30');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    Promise.all([repo.weights(), repo.measurements()]).then(([entries, records]) => { setWeights(entries); setMeasurements(records); }).catch(message);
  }, [revision]);

  const summary = weightSummary(weights);
  const plotted = useMemo(() => weights.slice().sort((a, b) => a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at)), [weights]);
  const start = addDays(dayKey(), 1 - Number(period));
  const inPeriod = plotted.filter(entry => entry.day >= start && entry.day <= dayKey());
  const highlighted = inPeriod.find(entry => entry.id === selectedId) ?? inPeriod.at(-1);
  const min = inPeriod.length ? Math.min(...inPeriod.map(entry => entry.kg)) : 0;
  const max = inPeriod.length ? Math.max(...inPeriod.map(entry => entry.kg)) : 0;
  const points = inPeriod.map((entry, index) => `${10 + index * 280 / Math.max(1, inPeriod.length - 1)},${90 - (entry.kg - min) * 70 / Math.max(1, max - min)}`).join(' ');
  const progress = summary.latest && profile ? weightGoalProgress(profile.start_weight, summary.latest.kg, profile.target_weight) : null;

  return <Page title="Weight" headerAction={<Pressable accessibilityRole="button" accessibilityLabel="Add weight or measurement" onPress={() => setAdding(true)} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sun, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="add" size={24} color={colors.ink}/></Pressable>}>
    <View style={{ gap: 16 }}>
      <DisplayMetric value={summary.latest ? summary.latest.kg : '—'} label="KG" size={120}/>
      <Text style={{ color: colors.accent, fontFamily: fonts.bold, fontSize: 12 }}>Change since start: {summary.change === null ? 'Needs two entries' : `${summary.change > 0 ? '+' : ''}${summary.change} kg`}</Text>
      <Choices label="Activity period" options={['7', '30', '90'] as const} value={period} onChange={setPeriod} compact/>
      {inPeriod.length > 1 ? <>
        <View><Text style={styles.label}>{highlighted?.day}</Text><Text style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 28 }}>{highlighted?.kg} kg</Text></View>
        <Svg width="100%" height={150} viewBox="0 0 300 105" accessibilityLabel="Weight history chart">
          {[15, 40, 65, 90].map(y => <Line key={y} x1={0} y1={y} x2={300} y2={y} stroke={colors.border} strokeWidth={1}/>)}
          <Polyline points={points} fill="none" stroke={colors.accent} strokeWidth={3}/>
          {inPeriod.map((entry, index) => { const x = 10 + index * 280 / Math.max(1, inPeriod.length - 1), y = 90 - (entry.kg - min) * 70 / Math.max(1, max - min); return <G key={entry.id}><Circle cx={x} cy={y} r={highlighted?.id === entry.id ? 5 : 3} fill={highlighted?.id === entry.id ? colors.sun : colors.accent} stroke={highlighted?.id === entry.id ? colors.ink : 'none'} strokeWidth={2}/><Circle cx={x} cy={y} r={13} fill="transparent" onPress={() => setSelectedId(entry.id)}/></G>; })}
        </Svg>
        <Text style={styles.muted}>{inPeriod[0].day} → {inPeriod.at(-1)?.day}</Text>
      </> : <Empty text={inPeriod.length ? 'Add another entry in this period to draw a trend.' : 'No weight entries in this period.'}/>}
      {progress !== null && <><Text style={styles.muted}>Progress toward target: {progress}%</Text><ProgressBar value={progress / 100}/></>}
      <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1, backgroundColor: colors.lilac, borderRadius: 24, padding: 14 }}><Text style={styles.label}>Starting</Text><Text style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 24 }}>{summary.first ? `${summary.first.kg} kg` : '—'}</Text></View><View style={{ flex: 1, backgroundColor: colors.mint, borderRadius: 24, padding: 14 }}><Text style={styles.label}>Target</Text><Text style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 24 }}>{profile?.target_weight ? `${profile.target_weight} kg` : 'Not set'}</Text></View></View>
    </View>
    <SectionHeader title="Weight history"/>
    {weights.length ? weights.map(entry => <Card key={entry.id}>
      <Text style={styles.text}>{entry.day} · {entry.kg} kg</Text><Text style={styles.muted}>{entry.note}</Text>
      <View style={styles.row}>
        <Button title="Edit" kind="ghost" onPress={() => router.push({ pathname: '/weight-form', params: { id: entry.id } })}/>
        <Button title="Delete" kind="danger" onPress={() => confirm('Delete weight entry?', async () => { await repo.remove('weights', entry.id); changed(); })}/>
      </View>
    </Card>) : <Empty/>}
    <SectionHeader title="Body measurements"/>
    {measurements.length ? measurements.map(measurement => <Card key={measurement.id}>
      <Text style={styles.text}>{measurement.type}: {measurement.value} {measurement.unit} · {measurement.day}</Text>
      <View style={styles.row}>
        <Button title="Edit" kind="ghost" onPress={() => router.push({ pathname: '/measurement-form', params: { id: measurement.id } })}/>
        <Button title="Delete" kind="danger" onPress={() => confirm('Delete measurement?', async () => { await repo.remove('measurements', measurement.id); changed(); })}/>
      </View>
    </Card>) : <Empty text="No body measurements yet."/>}
    <BottomSheet visible={adding} title="Add" onClose={() => setAdding(false)}>{close => <><Button title="Add weight" onPress={() => close(() => router.push('/weight-form'))}/><Button title="Add measurement" kind="ghost" onPress={() => close(() => router.push('/measurement-form'))}/></>}</BottomSheet>
  </Page>;
}
