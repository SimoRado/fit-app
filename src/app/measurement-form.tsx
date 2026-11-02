import React, { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { dayKey, uid, validDay } from '../core/date';
import { Measurement } from '../core/types';
import { repo } from '../data/db';
import { useApp } from '../state/app';
import { Button, Card, Choices, Field, message, Page } from '../ui/components';

const standardTypes = ['Chest', 'Waist', 'Arms', 'Legs'] as const;
export default function MeasurementForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { profile, changed } = useApp();
  const [original, setOriginal] = useState<Measurement | null>(null);
  const [day, setDay] = useState(dayKey());
  const [type, setType] = useState('Waist');
  const [customName, setCustomName] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('cm');

  useEffect(() => {
    if (id) repo.one<Measurement>('measurements', id).then(m => {
      if (!m) return;
      setOriginal(m); setDay(m.day); setValue(String(m.value)); setUnit(m.unit);
      if (standardTypes.includes(m.type as typeof standardTypes[number])) setType(m.type);
      else { setType('Custom'); setCustomName(m.type); }
    });
  }, [id]);

  async function save() {
    try {
      const measurementType = type === 'Custom' ? customName.trim() : type;
      const amount = Number(value);
      if (!validDay(day) || day > dayKey() || !measurementType) throw Error('Enter a valid date that is not in the future and a measurement type.');
      if (!value || !Number.isFinite(amount) || amount <= 0 || amount > 1000) throw Error('Enter a value between 0 and 1000.');
      await repo.saveMeasurement({ id: original?.id ?? uid(), owner_id: profile!.id, day, type: measurementType, value: amount, unit });
      changed(); router.back();
    } catch (error) { message(error); }
  }

  return <Page title={id ? 'Edit measurement' : 'Add measurement'}><Card>
    <Field label="Date (YYYY-MM-DD)" value={day} onChangeText={setDay}/>
    <Choices label="Type" options={[...standardTypes, 'Custom']} value={type} onChange={setType}/>
    {type === 'Custom' && <Field label="Custom name" value={customName} onChangeText={setCustomName}/>}
    <Field label="Value" value={value} onChangeText={setValue} keyboardType="decimal-pad"/>
    <Choices label="Unit" options={['cm', 'in']} value={unit} onChange={setUnit}/>
    <Button title="Save" onPress={save}/>
  </Card></Page>;
}
