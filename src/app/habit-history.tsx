import React, { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Text } from '../ui/LocalizedText';
import { Habit, HabitCompletion } from '../core/types';
import { habitStreak } from '../core/logic';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { Card, Empty, Page, message, styles } from '../ui/components';
import { useLoadState } from '../state/useLoadState';
import { LoadError, SkeletonBlock, SkeletonCard, SkeletonScreen, SkeletonText } from '../ui/Skeleton';
export default function History(){const {id}=useLocalSearchParams<{id:string}>();const {revision}=useApp();const [habit,setHabit]=useState<Habit|null>(null),[records,setRecords]=useState<HabitCompletion[]>([]);const load=useLoadState();const {attempt,succeed,fail}=load;useEffect(()=>{let active=true;Promise.all([repo.one<Habit>('habits',id),repo.completions()]).then(([h,x])=>{if(!active)return;setHabit(h);setRecords(x.filter(c=>c.habit_id===id).sort((a,b)=>b.day.localeCompare(a.day)));succeed();}).catch(error=>{if(active&&!fail())message(error);});return()=>{active=false;};},[id,revision,attempt,succeed,fail]);const stats=habit?habitStreak(habit,records):null;const unit=habit?.frequency==='quota'?'weeks':'scheduled occurrences';if(load.status!=='ready')return <Page title={habit?.name??'Habit history'}>{load.status==='error'?<LoadError text="Could not load this habit's history." onRetry={load.retry}/>:<SkeletonScreen label="Loading habit history"><SkeletonCard><SkeletonText lines={3} size={16} width="62%" lastWidth="48%"/></SkeletonCard>{[0,1,2].map(index=><SkeletonCard key={index}><SkeletonBlock width={96} height={13} radius={7}/></SkeletonCard>)}</SkeletonScreen>}</Page>;return <Page title={habit?.name??'Habit history'}><Card><Text style={styles.text}>{`Current streak: ${stats?.current??0} ${unit}`}</Text><Text style={styles.text}>{`Longest streak: ${stats?.longest??0} ${unit}`}</Text><Text style={styles.text}>Total completions: {stats?.total??0}</Text></Card>{records.length?records.map(c=><Card key={c.id}><Text style={styles.text}>{c.day}</Text></Card>):<Empty/>}</Page>}
