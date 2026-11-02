import React, { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { weightGoalProgress, weightSummary } from '../core/logic';
import { Measurement, WeightEntry } from '../core/types';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { Button, Card, Empty, Page, styles, confirm, message } from '../ui/components';
import { Text } from '../ui/LocalizedText';
import { colors } from '../ui/theme';

export default function Weight() {
  const { profile, revision, changed } = useApp();
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  useEffect(() => {
    Promise.all([repo.weights(), repo.measurements()]).then(([entries, records]) => { setWeights(entries); setMeasurements(records); }).catch(message);
  }, [revision]);

  const summary = weightSummary(weights);
  const plotted = useMemo(() => weights.slice().sort((a, b) => a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at)), [weights]);
  const min = plotted.length ? Math.min(...plotted.map(entry => entry.kg)) : 0;
  const max = plotted.length ? Math.max(...plotted.map(entry => entry.kg)) : 0;
  const points = plotted.map((entry, index) => `${10 + index * 280 / Math.max(1, plotted.length - 1)},${90 - (entry.kg - min) * 70 / Math.max(1, max - min)}`).join(' ');
  const progress = summary.latest && profile ? weightGoalProgress(profile.start_weight, summary.latest.kg, profile.target_weight) : null;

  return <Page title="Weight & measurements">
    <Card>
      <Text style={styles.text}>Latest weight: {summary.latest ? `${summary.latest.kg} kg` : 'No entries'}</Text>
      <Text style={styles.text}>Starting: {summary.first ? `${summary.first.kg} kg` : '—'}</Text>
      <Text style={styles.text}>Target: {profile?.target_weight ? `${profile.target_weight} kg` : 'Not set'}</Text>
      <Text style={styles.text}>Change: {summary.change === null ? 'Needs two entries' : `${summary.change > 0 ? '+' : ''}${summary.change} kg`}</Text>
      {progress !== null && <Text style={styles.muted}>Progress toward target: {progress}%</Text>}
      {plotted.length > 1 && <>
        <Svg width="100%" height={115} viewBox="0 0 300 105" accessibilityLabel="Weight history chart">
          <Polyline points={points} fill="none" stroke={colors.accent} strokeWidth={3}/>
          {plotted.map((entry, index) => <Circle key={entry.id} cx={10 + index * 280 / Math.max(1, plotted.length - 1)} cy={90 - (entry.kg - min) * 70 / Math.max(1, max - min)} r={3} fill={colors.accent}/>) }
        </Svg>
        <Text style={styles.muted}>{plotted[0].day} · {plotted[0].kg} kg → {plotted.at(-1)?.day} · {plotted.at(-1)?.kg} kg</Text>
      </>}
      <Button title="Add weight" onPress={() => router.push('/weight-form')}/>
      <Button title="Add measurement" kind="ghost" onPress={() => router.push('/measurement-form')}/>
    </Card>
    <Text style={styles.subtitle}>Weight history</Text>
    {weights.length ? weights.map(entry => <Card key={entry.id}>
      <Text style={styles.text}>{entry.day} · {entry.kg} kg</Text><Text style={styles.muted}>{entry.note}</Text>
      <View style={styles.row}>
        <Button title="Edit" kind="ghost" onPress={() => router.push({ pathname: '/weight-form', params: { id: entry.id } })}/>
        <Button title="Delete" kind="danger" onPress={() => confirm('Delete weight entry?', async () => { await repo.remove('weights', entry.id); changed(); })}/>
      </View>
    </Card>) : <Empty/>}
    <Text style={styles.subtitle}>Body measurements</Text>
    {measurements.length ? measurements.map(measurement => <Card key={measurement.id}>
      <Text style={styles.text}>{measurement.type}: {measurement.value} {measurement.unit} · {measurement.day}</Text>
      <View style={styles.row}>
        <Button title="Edit" kind="ghost" onPress={() => router.push({ pathname: '/measurement-form', params: { id: measurement.id } })}/>
        <Button title="Delete" kind="danger" onPress={() => confirm('Delete measurement?', async () => { await repo.remove('measurements', measurement.id); changed(); })}/>
      </View>
    </Card>) : <Empty text="No body measurements yet."/>}
  </Page>;
}
