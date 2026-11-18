import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { dayKey } from '../core/date';
import { WeightEntry } from '../core/types';
import { todaysWeightEntry, validWeightKg, MIN_WEIGHT_KG, MAX_WEIGHT_KG } from '../core/weightPolicy';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { Button, Card, Field, message, Page } from '../ui/components';
import { Text } from '../ui/LocalizedText';
import { localeFor, shortDay } from '../ui/dates';
import { fonts } from '../ui/theme';
import { usePalette } from '../ui/voltKit';

/**
 * Add or edit today's weigh-in. The date is always the current local day and
 * cannot be changed here; earlier weigh-ins open read-only.
 */
export default function WeightForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { profile, changed, language } = useApp();
  const p = usePalette();
  const [today] = useState(dayKey);
  const [existing, setExisting] = useState<WeightEntry | null>(null);
  const [historical, setHistorical] = useState<WeightEntry | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [kg, setKg] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    let active = true;
    repo.weights().then(entries => {
      if (!active) return;
      const requested = id ? entries.find(entry => entry.id === id) : undefined;
      if (requested && requested.day !== today) { setHistorical(requested); setLoaded(true); return; }
      const current = todaysWeightEntry(entries, today) ?? null;
      setExisting(current);
      if (current) { setKg(String(current.kg)); setNote(current.note); }
      setLoaded(true);
    }).catch(message);
    return () => { active = false; };
  }, [id, today]);

  async function save() {
    const value = Number(kg.replace(',', '.'));
    if (!kg.trim() || !validWeightKg(value)) throw Error(`Weight must be ${MIN_WEIGHT_KG}–${MAX_WEIGHT_KG} kg.`);
    if (!profile) throw Error('Your profile is still loading. Please try again.');
    if (dayKey() !== today) throw Error('The date changed while this screen was open. Please reopen it to record today’s weight.');
    await repo.saveTodayWeight(profile.id, value, note);
    changed();
    router.back();
  }

  const locale = localeFor(language);
  if (historical) return <Page title="Weigh-in">
    <Card>
      <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase' }}>{shortDay(locale, historical.day)}</Text>
      <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 34 }}>{historical.kg.toFixed(1)} kg</Text>
      {!!historical.note && <Text style={{ color: p.muted, fontSize: 14 }}>{historical.note}</Text>}
      <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 }}>Earlier weigh-ins are kept as history and can&apos;t be changed. You can add or update today&apos;s weight.</Text>
    </Card>
  </Page>;

  return <Page title={existing ? 'Edit today' : 'Add weight'}>
    <Card>
      <View style={{ gap: 4 }}>
        <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.77, textTransform: 'uppercase' }}>Date</Text>
        <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 17 }}>Today · {shortDay(locale, today)}</Text>
      </View>
      <Field label="Weight (kg)" value={kg} onChangeText={setKg} keyboardType="decimal-pad"/>
      <Field label="Note (optional)" value={note} onChangeText={setNote}/>
      <Button title={existing ? 'Update today’s weight' : 'Save'} disabled={!loaded} onPress={save}/>
      <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12, lineHeight: 17 }}>{existing ? 'This replaces today’s value. Your earlier weigh-ins stay unchanged.' : 'Weigh-ins are recorded for today. Earlier days stay as read-only history.'}</Text>
    </Card>
  </Page>;
}
