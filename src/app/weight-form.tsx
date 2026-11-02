import React, { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { dayKey, uid, validDay } from '../core/date';
import { WeightEntry } from '../core/types';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { Button, Card, Field, message, Page } from '../ui/components';
export default function WeightForm(){const {id}=useLocalSearchParams<{id?:string}>();const {profile,changed}=useApp();const [original,setOriginal]=useState<WeightEntry|null>(null),[day,setDay]=useState(dayKey()),[kg,setKg]=useState(''),[note,setNote]=useState('');useEffect(()=>{if(id)repo.one<WeightEntry>('weights',id).then(w=>{if(!w)return;setOriginal(w);setDay(w.day);setKg(String(w.kg));setNote(w.note);});},[id]);async function save(){try{if(!validDay(day)||day>dayKey())throw Error('Enter a valid date that is not in the future.');const n=Number(kg);if(!kg||!Number.isFinite(n)||n<20||n>500)throw Error('Weight must be 20–500 kg.');await repo.saveWeight({id:original?.id??uid(),owner_id:profile!.id,day,kg:n,note,created_at:original?.created_at??new Date().toISOString()});changed();router.back();}catch(e){message(e);}}return <Page title={id?'Edit weight':'Add weight'}><Card><Field label="Date (YYYY-MM-DD)" value={day} onChangeText={setDay}/><Field label="Weight (kg)" value={kg} onChangeText={setKg} keyboardType="decimal-pad"/><Field label="Note (optional)" value={note} onChangeText={setNote}/><Button title="Save" onPress={save}/></Card></Page>}
