import React, { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Text } from '../ui/LocalizedText';
import { Habit, HabitCompletion } from '../core/types';
import { habitStreak } from '../core/logic';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { Card, Empty, Page, styles } from '../ui/components';
export default function History(){const {id}=useLocalSearchParams<{id:string}>();const {revision}=useApp();const [habit,setHabit]=useState<Habit|null>(null),[records,setRecords]=useState<HabitCompletion[]>([]);useEffect(()=>{repo.one<Habit>('habits',id).then(setHabit);repo.completions().then(x=>setRecords(x.filter(c=>c.habit_id===id).sort((a,b)=>b.day.localeCompare(a.day))));},[id,revision]);const stats=habit?habitStreak(habit,records):null;const unit=habit?.frequency==='quota'?'weeks':'scheduled occurrences';return <Page title={habit?.name??'Habit history'}><Card><Text style={styles.text}>{`Current streak: ${stats?.current??0} ${unit}`}</Text><Text style={styles.text}>{`Longest streak: ${stats?.longest??0} ${unit}`}</Text><Text style={styles.text}>Total completions: {stats?.total??0}</Text></Card>{records.length?records.map(c=><Card key={c.id}><Text style={styles.text}>{c.day}</Text></Card>):<Empty/>}</Page>}
