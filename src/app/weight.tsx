import React, { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import Svg, { Circle, G, Polyline } from 'react-native-svg';
import { addDays, dayKey } from '../core/date';
import { weightGoalProgress, weightSummary } from '../core/logic';
import { Measurement, WeightEntry } from '../core/types';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { Button, Card, Choices, Empty, Page, styles, confirm, message } from '../ui/components';
import { Text } from '../ui/LocalizedText';
import { colors } from '../ui/theme';
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

  return <Page title="Weight">
    <Card>
      <DisplayMetric value={summary.latest ? summary.latest.kg : '—'} label="KG" size={96}/>
      <Text style={styles.text}>Starting: {summary.first ? `${summary.first.kg} kg` : '—'}</Text>
      <Text style={styles.text}>Target: {profile?.target_weight ? `${profile.target_weight} kg` : 'Not set'}</Text>
      <Text style={styles.text}>Change: {summary.change === null ? 'Needs two entries' : `${summary.change > 0 ? '+' : ''}${summary.change} kg`}</Text>
      {progress !== null && <><Text style={styles.muted}>Progress toward target: {progress}%</Text><ProgressBar value={progress / 100}/></>}
      <Choices label="Activity period" options={['7', '30', '90'] as const} value={period} onChange={setPeriod} compact/>
      {inPeriod.length > 1 ? <>
        <Svg width="100%" height={150} viewBox="0 0 300 105" accessibilityLabel="Weight history chart">
          <Polyline points={points} fill="none" stroke={colors.accent} strokeWidth={3}/>
          {inPeriod.map((entry, index) => { const x = 10 + index * 280 / Math.max(1, inPeriod.length - 1), y = 90 - (entry.kg - min) * 70 / Math.max(1, max - min); return <G key={entry.id}><Circle cx={x} cy={y} r={highlighted?.id === entry.id ? 5 : 3} fill={colors.accent}/><Circle cx={x} cy={y} r={13} fill="transparent" onPress={() => setSelectedId(entry.id)}/></G>; })}
        </Svg>
        <Text style={styles.muted}>{highlighted?.day} · {highlighted?.kg} kg</Text>
        <Text style={styles.muted}>{inPeriod[0].day} → {inPeriod.at(-1)?.day}</Text>
      </> : <Empty text={inPeriod.length ? 'Add another entry in this period to draw a trend.' : 'No weight entries in this period.'}/>}
      <Button title="Add" onPress={() => setAdding(true)}/>
    </Card>
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
