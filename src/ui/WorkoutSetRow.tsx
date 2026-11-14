import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Exercise } from '../core/types';
import { DraftSet } from '../state/workoutDraft';
import { Field, confirm } from './components';
import { MotionPressable } from './MotionPressable';
import { Text } from './LocalizedText';
import { colors, fonts } from './theme';
import { useApp } from '../state/app';

export function WorkoutSetRow({ set, index, metric, onChange, onRemove }: { set: DraftSet; index: number; metric: Exercise['metric']; onChange: (patch: Partial<DraftSet>) => void; onRemove: () => void }) {
  const [showNote, setShowNote] = useState(!!set.note);
  const { language } = useApp();
  // Volt set row: soft pill inputs, lime when the set is done, round check on the right.
  const light = colors.bg === '#F5F9FF';
  const inputStyle = { minHeight: 44, borderRadius: 14, backgroundColor: set.completed ? (light ? colors.softLime : 'rgba(223,255,31,0.16)') : (light ? colors.soft1 : colors.card2), paddingHorizontal: 7, color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 19, textAlign: language === 'ar' ? 'right' as const : 'center' as const };
  const header = { color: colors.muted, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.8, textAlign: 'center' as const };
  return <View style={{ paddingVertical: 6, gap: 4 }}>
    {index === 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 2 }}><Text style={[header, { width: 28 }]}>SET</Text><Text style={[header, { flex: 1 }]}>{metric === 'duration' ? 'SECONDS' : metric === 'weight_reps' ? 'KG' : 'REPS'}</Text>{metric === 'weight_reps' && <Text style={[header, { flex: 1 }]}>REPS</Text>}<View style={{ width: 40 }}/></View>}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <Text style={{ width: 28, textAlign: 'center', color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 15 }}>{index + 1}</Text>
      {metric === 'duration' ? <TextInput accessibilityLabel="Seconds" value={set.duration} onChangeText={duration => onChange({ duration })} keyboardType="numeric" style={[inputStyle, { flex: 1 }]}/> : <>
        {metric === 'weight_reps' && <TextInput accessibilityLabel="Weight (kg)" value={set.weight} onChangeText={weight => onChange({ weight })} keyboardType="decimal-pad" style={[inputStyle, { flex: 1 }]}/>}
        <TextInput accessibilityLabel="Reps" value={set.reps} onChangeText={reps => onChange({ reps })} keyboardType="numeric" style={[inputStyle, { flex: 1 }]}/>
      </>}
      <MotionPressable selected={set.completed} pressScale={0.86} accessibilityRole="checkbox" accessibilityState={{ checked: set.completed }} accessibilityLabel={'Set ' + (index + 1)} onPress={() => onChange({ completed: !set.completed })} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: set.completed ? colors.g1 : 'transparent', borderWidth: set.completed ? 0 : 2, borderColor: colors.borderStrong }}>
        {set.completed && <Ionicons name="checkmark" size={20} color={colors.plInk}/>}
      </MotionPressable>
    </View>
    {showNote && <Field label="Set note" value={set.note} onChangeText={note => onChange({ note })}/>}
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 2 }}><Pressable accessibilityRole="button" accessibilityLabel="Set notes" onPress={() => setShowNote(!showNote)} style={{ minWidth: 40, minHeight: 32, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="create-outline" size={17} color={colors.muted}/></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Remove set" onPress={() => confirm('Remove set?', onRemove)} style={{ minWidth: 40, minHeight: 32, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="trash-outline" size={16} color={colors.muted}/></Pressable></View>
  </View>;
}
