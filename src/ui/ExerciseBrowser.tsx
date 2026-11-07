import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Exercise } from '../core/types';
import { repo } from '../data/db';
import type { ExerciseDetail } from '../data/exerciseCatalog';
import { useApp } from '../state/app';
import { Button, Field, message, styles } from './components';
import { Text } from './LocalizedText';
import { colors, fonts } from './theme';

type Result = Exercise & { muscle_group: string | null; equipment: string | null; category: string | null };
function Filter({ title, values, value, change }: { title: string; values: string[]; value: string; change: (next: string) => void }) {
  return <View style={{ gap: 7 }}><Text style={styles.label}>{title}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
    {['All', ...values].map(option => {
      const selected = value === (option === 'All' ? '' : option);
      return <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => change(option === 'All' ? '' : option)} style={{ backgroundColor: selected ? colors.ink : colors.card, borderColor: colors.borderStrong, borderWidth: 1, borderRadius: 24, paddingHorizontal: 13, paddingVertical: 10 }}><Text style={{ color: selected ? colors.card : colors.text, fontFamily: fonts.bold, textTransform: 'capitalize' }}>{option}</Text></Pressable>;
    })}
  </ScrollView></View>;
}
export function ExerciseBrowser({ onSelect }: { onSelect: (exercise: Exercise) => void }) {
  const { language } = useApp();
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equipment, setEquipment] = useState('');
  const [category, setCategory] = useState('');
  const [filters, setFilters] = useState({ muscles: [] as string[], equipment: [] as string[], categories: [] as string[] });
  const [results, setResults] = useState<Result[]>([]);
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  useEffect(() => { repo.exerciseFilters().then(setFilters).catch(message); }, []);
  useEffect(() => { let active = true; repo.searchExercises(search, muscle, equipment, category).then(rows => { if (active) setResults(rows); }).catch(message); return () => { active = false; }; }, [search, muscle, equipment, category]);
  async function showDetail(id: string) { try { setDetail(await repo.exerciseDetail(id)); } catch (error) { message(error); } }
  const instructions = detail ? JSON.parse(detail.instructions) as Record<string, string> : null;
  const steps = detail ? JSON.parse(detail.instruction_steps) as Record<string, string[]> : null;
  return <View style={{ gap: 12 }}>
    <Field label="Search exercises" value={search} onChangeText={setSearch} placeholder="Name, muscle, equipment, or category"/>
    <Filter title="Muscle group" values={filters.muscles} value={muscle} change={setMuscle}/>
    <Filter title="Equipment" values={filters.equipment} value={equipment} change={setEquipment}/>
    <Filter title="Category" values={filters.categories} value={category} change={setCategory}/>
    {detail && <View style={{ padding: 15, borderRadius: 20, backgroundColor: colors.card, gap: 8 }}>
      <Text style={{ color: colors.text, fontFamily: fonts.bold }}>{results.find(row => row.id === detail.exercise_id)?.name ?? detail.target_muscle}</Text>
      <Text style={styles.muted}>{detail.muscle_group} · {detail.equipment} · {detail.category}</Text>
      {(steps?.[language] ?? steps?.en)?.length ? (steps?.[language] ?? steps?.en).map((step, index) => <Text key={index} style={styles.text}>{index + 1}. {step}</Text>) : <Text style={styles.text}>{instructions?.[language] ?? instructions?.en}</Text>}
      <Button title="Close details" kind="ghost" onPress={() => setDetail(null)}/>
    </View>}
    {results.map(exercise => <View key={exercise.id} style={{ padding: 12, borderRadius: 18, backgroundColor: colors.card, gap: 5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Ionicons name="fitness-outline" size={22} color={colors.text}/><Text style={{ color: colors.text, fontFamily: fonts.bold, flex: 1 }}>{exercise.name}</Text></View>
      {!!exercise.muscle_group && <Text style={styles.muted}>{exercise.muscle_group} · {exercise.equipment}</Text>}
      <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button title="Select" onPress={() => onSelect(exercise)}/></View>{exercise.muscle_group && <View style={{ flex: 1 }}><Button title="Details" kind="ghost" onPress={() => showDetail(exercise.id)}/></View>}</View>
    </View>)}
    {results.length === 60 && <Text style={styles.muted}>Showing the first 60 matches. Refine your search for more.</Text>}
    {!results.length && <Text style={styles.muted}>No exercises found.</Text>}
  </View>;
}
