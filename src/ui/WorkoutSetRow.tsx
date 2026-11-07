import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Exercise } from '../core/types';
import { DraftSet } from '../state/workoutDraft';
import { Field, confirm } from './components';
import { HabitCheck } from './visuals';
import { Text } from './LocalizedText';
import { colors, fonts } from './theme';
import { useApp } from '../state/app';

export function WorkoutSetRow({ set, index, metric, onChange, onRemove }: { set: DraftSet; index: number; metric: Exercise['metric']; onChange: (patch: Partial<DraftSet>) => void; onRemove: () => void }) {
  const [showNote, setShowNote] = useState(!!set.note);
  const { language } = useApp();
  const inputStyle = { minHeight: 50, borderRadius: 20, backgroundColor: set.completed ? colors.mint : colors.card2, paddingHorizontal: 7, color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 24, textAlign: language === 'ar' ? 'right' as const : 'center' as const };
  return <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 14, gap: 8 }}>
    {index === 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Text style={{ width: 32, color: colors.muted, fontFamily: fonts.mono, fontSize: 10 }}>SET</Text><Text style={{ flex: 1, color: colors.muted, fontFamily: fonts.mono, fontSize: 10 }}>{metric === 'duration' ? 'SECONDS' : metric === 'weight_reps' ? 'KG' : 'REPS'}</Text>{metric === 'weight_reps' && <Text style={{ flex: 1, color: colors.muted, fontFamily: fonts.mono, fontSize: 10 }}>REPS</Text>}<View style={{ width: 48 }}/></View>}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <Text style={{ width: 32, color: colors.muted, fontFamily: fonts.mono, fontSize: 13 }}>{index + 1}</Text>
      {metric === 'duration' ? <TextInput accessibilityLabel="Seconds" value={set.duration} onChangeText={duration => onChange({ duration })} keyboardType="numeric" style={[inputStyle, { flex: 1 }]}/> : <>
        {metric === 'weight_reps' && <TextInput accessibilityLabel="Weight (kg)" value={set.weight} onChangeText={weight => onChange({ weight })} keyboardType="decimal-pad" style={[inputStyle, { flex: 1 }]}/>}
        <TextInput accessibilityLabel="Reps" value={set.reps} onChangeText={reps => onChange({ reps })} keyboardType="numeric" style={[inputStyle, { flex: 1 }]}/>
      </>}
      <HabitCheck checked={set.completed} label={'Set ' + (index + 1)} onPress={() => onChange({ completed: !set.completed })}/>
    </View>
    {showNote && <Field label="Set note" value={set.note} onChangeText={note => onChange({ note })}/>}
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 5 }}><Pressable accessibilityRole="button" accessibilityLabel="Set notes" onPress={() => setShowNote(!showNote)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="create-outline" size={20} color={colors.muted}/></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Remove set" onPress={() => confirm('Remove set?', onRemove)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="trash-outline" size={19} color={colors.muted}/></Pressable></View>
  </View>;
}
