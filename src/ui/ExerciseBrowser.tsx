import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { Exercise } from '../core/types';
import { localize } from '../core/i18n';
import { ensureExerciseCatalog, exerciseCatalogState, repo, subscribeExerciseCatalog } from '../data/db';
import { storageErrorMessage } from '../core/errors';
import type { ExerciseDetail } from '../data/exerciseCatalog';
import { useApp } from '../state/app';
import { message } from './components';
import { Text } from './LocalizedText';
import { fonts } from './theme';
import { useReducedMotion } from './motion';
import { MotionPressable } from './MotionPressable';
import { isLight, usePalette } from './voltKit';

type Result = Exercise & { muscle_group: string | null; equipment: string | null; category: string | null };

/** Volt filter chips (`.fchips`): horizontal, single-select, "All" clears. */
function Filter({ title, values, value, change }: { title: string; values: string[]; value: string; change: (next: string) => void }) {
  const p = usePalette();
  return <View style={{ gap: 6 }}>
    <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase' }}>{title}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 20 }}>
      {['All', ...values].map(option => {
        const selected = value === (option === 'All' ? '' : option);
        return <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => change(option === 'All' ? '' : option)} style={{ backgroundColor: selected ? p.g1 : p.c8, borderColor: selected ? p.g1 : p.c8Line, borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 }}>
          <Text style={{ color: selected ? p.plInk : p.text, fontFamily: fonts.bold, fontSize: 12, textTransform: 'capitalize' }}>{option}</Text>
        </Pressable>;
      })}
    </ScrollView>
  </View>;
}

/**
 * Text-only exercise library picker: search, muscle/equipment/category filters, inline
 * details and a clear Add / Added state. A short lock ignores accidental double taps.
 */
export function ExerciseBrowser({ onSelect, selectedIds = new Set<string>() }: { onSelect: (exercise: Exercise) => void; selectedIds?: ReadonlySet<string> }) {
  const { language } = useApp();
  const p = usePalette();
  const reduced = useReducedMotion();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equipment, setEquipment] = useState('');
  const [category, setCategory] = useState('');
  const [moreFilters, setMoreFilters] = useState(false);
  const [filters, setFilters] = useState({ muscles: [] as string[], equipment: [] as string[], categories: [] as string[] });
  const [results, setResults] = useState<Result[]>([]);
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const lastPick = useRef(0);
  // Loading / error / retry: the library may still be importing on a first launch.
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const catalog = useSyncExternalStore(subscribeExerciseCatalog, exerciseCatalogState);
  useEffect(() => { let active = true; repo.exerciseFilters().then(rows => { if (active) setFilters(rows); }).catch(() => undefined); return () => { active = false; }; }, [attempt]);
  useEffect(() => { const timer = setTimeout(() => setQuery(search), 150); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    let active = true;
    setLoading(true); setFailure(null);
    // Never spin forever: after 20 s offer a retry even if the query has not settled.
    const watchdog = setTimeout(() => { if (active) { setLoading(false); setFailure('The exercise library is taking longer than expected.'); } }, 20000);
    repo.searchExercises(query, muscle, equipment, category)
      .then(rows => { if (active) { setResults(rows); setFailure(null); } })
      .catch(cause => { if (active) setFailure(storageErrorMessage(cause)); })
      .finally(() => { if (active) { clearTimeout(watchdog); setLoading(false); } });
    return () => { active = false; clearTimeout(watchdog); };
  }, [query, muscle, equipment, category, attempt]);
  async function toggleDetail(id: string) {
    if (detail?.exercise_id === id) { setDetail(null); return; }
    try { setDetail(await repo.exerciseDetail(id)); } catch (error) { message(error); }
  }
  function pick(exercise: Exercise) {
    const now = Date.now();
    if (now - lastPick.current < 700) return;
    lastPick.current = now;
    onSelect(exercise);
  }
  const instructions = detail ? JSON.parse(detail.instructions) as Record<string, string> : null;
  const steps = detail ? JSON.parse(detail.instruction_steps) as Record<string, string[]> : null;
  const secondary = detail ? JSON.parse(detail.secondary_muscles) as string[] : [];
  const filtered = !!(muscle || equipment || category);
  const clearFilters = () => { setMuscle(''); setEquipment(''); setCategory(''); };
  const soft = isLight(p) ? p.soft1 : p.card2;

  return <View style={{ gap: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingHorizontal: 14, borderRadius: 999, backgroundColor: p.c8, borderWidth: 1.5, borderColor: p.borderStrong }}>
      <Ionicons name="search" size={17} color={p.muted}/>
      <TextInput accessibilityLabel={localize('Search exercises', language)} value={search} onChangeText={setSearch} placeholder={localize('Name, muscle, equipment, or category', language)} placeholderTextColor={p.subtle} autoCorrect={false} returnKeyType="search" style={{ flex: 1, minHeight: 44, color: p.text, fontFamily: fonts.semibold, fontSize: 15 }}/>
      {!!search && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={p.muted}/></Pressable>}
    </View>
    <Filter title="Muscle group" values={filters.muscles} value={muscle} change={setMuscle}/>
    {moreFilters && <>
      <Filter title="Equipment" values={filters.equipment} value={equipment} change={setEquipment}/>
      <Filter title="Category" values={filters.categories} value={category} change={setCategory}/>
    </>}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Pressable accessibilityRole="button" onPress={() => setMoreFilters(value => !value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 }}><Ionicons name={moreFilters ? 'chevron-up' : 'options-outline'} size={14} color={p.accent}/><Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 12.5 }}>{moreFilters ? 'Fewer filters' : 'Equipment & category'}</Text></Pressable>
      {filtered ? <Pressable accessibilityRole="button" onPress={clearFilters} style={{ paddingVertical: 4 }}><Text style={{ color: p.accent, fontFamily: fonts.bold, fontSize: 12.5 }}>Clear filters</Text></Pressable> : <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12 }}>{results.length === 60 ? '60+ matches' : `${results.length} match${results.length === 1 ? '' : 'es'}`}</Text>}
    </View>
    <View style={{ gap: 8 }}>
      {results.map(exercise => {
        const added = selectedIds.has(exercise.id);
        const open = detail?.exercise_id === exercise.id;
        return <View key={exercise.id} style={{ borderRadius: 20, backgroundColor: p.c8, borderWidth: 1, borderColor: added ? p.g1 : p.c8Line, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingLeft: 12, paddingRight: 10 }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${exercise.name} details`} disabled={!exercise.muscle_group} onPress={() => { void toggleDetail(exercise.id); }} style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text numberOfLines={2} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 14 }}>{exercise.name}</Text>
              <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12, textTransform: 'capitalize' }}>{exercise.custom ? 'Custom exercise' : [exercise.muscle_group, exercise.equipment].filter(Boolean).join(' · ')}{exercise.muscle_group ? `  ·  ${open ? 'Hide' : 'Details'}` : ''}</Text>
            </Pressable>
            <MotionPressable pressScale={0.9} accessibilityRole="button" accessibilityLabel={added ? `${exercise.name} is already added` : `Add ${exercise.name}`} onPress={() => pick(exercise)}
              style={{ minWidth: 72, height: 34, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 12, backgroundColor: added ? soft : p.g1 }}>
              <Ionicons name={added ? 'checkmark' : 'add'} size={15} color={added ? p.accent : p.plInk}/>
              <Text style={{ color: added ? p.accent : p.plInk, fontFamily: fonts.bold, fontSize: 12 }}>{added ? 'Added' : 'Add'}</Text>
            </MotionPressable>
          </View>
          {open && detail && <Animated.View entering={reduced ? undefined : FadeIn.duration(200)} style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 6, borderTopWidth: 1, borderTopColor: p.border, paddingTop: 10 }}>
            <Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 12, textTransform: 'capitalize' }}>{[detail.category, detail.equipment].filter(Boolean).join(' · ')}</Text>
            {!!detail.target_muscle && <Text style={{ color: p.text, fontFamily: fonts.semibold, fontSize: 12.5, textTransform: 'capitalize' }}>Target: {detail.target_muscle}</Text>}
            {secondary.length > 0 && <Text style={{ color: p.muted, fontSize: 12.5, textTransform: 'capitalize' }}>Secondary: {secondary.join(', ')}</Text>}
            {(steps?.[language] ?? steps?.en)?.length ? (steps?.[language] ?? steps?.en).map((step, index) => <Text key={index} style={{ color: p.text, fontSize: 13, lineHeight: 19 }}>{index + 1}. {step}</Text>) : !!(instructions?.[language] ?? instructions?.en) && <Text style={{ color: p.text, fontSize: 13, lineHeight: 19 }}>{instructions?.[language] ?? instructions?.en}</Text>}
          </Animated.View>}
        </View>;
      })}
    </View>
    {results.length === 60 && <Text style={{ color: p.muted, fontSize: 12 }}>Showing the first 60 matches. Refine your search for more.</Text>}
    {(loading && !results.length) || (catalog.status === 'loading' && !results.length) ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 }}><ActivityIndicator color={p.accent}/><Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 13 }}>{catalog.status === 'loading' ? 'Preparing the exercise library…' : 'Loading exercises…'}</Text></View>
      : failure && !results.length ? <View style={{ gap: 10, padding: 16, borderRadius: 18, backgroundColor: soft }}>
        <Text accessibilityRole="alert" style={{ color: p.text, fontFamily: fonts.semibold, fontSize: 13 }}>{failure}</Text>
        <Pressable accessibilityRole="button" onPress={() => { ensureExerciseCatalog().catch(() => undefined).finally(() => setAttempt(value => value + 1)); }} style={{ alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: p.g1 }}><Text style={{ color: p.plInk, fontFamily: fonts.bold, fontSize: 12.5 }}>Try again</Text></Pressable>
      </View>
      : null}
    {!loading && !failure && !results.length && <View style={{ padding: 16, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: p.borderStrong }}><Text style={{ color: p.muted, fontFamily: fonts.semibold, fontSize: 13 }}>No exercises found. Try another word or clear the filters.</Text></View>}
  </View>;
}
