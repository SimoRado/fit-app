import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { repo } from '../data/db';
import { Language, Profile } from '../core/types';
import { setActiveLanguage } from '../core/i18n';
import { reconcileReminders } from '../services/reminders';
import { Appearance, parseAppearance } from '../ui/theme';
import { useVoltTheme } from '../ui/VoltThemeProvider';
import { parseMeasurementSystem, type MeasurementSystem } from '../core/foodUnits';
type State = { ready: boolean; profile: Profile | null; language: Language; setLanguage: (language: Language) => void; appearance: Appearance; setAppearance: (appearance: Appearance) => Promise<void>; measurementSystem: MeasurementSystem; setMeasurementSystem: (system: MeasurementSystem) => Promise<void>; revision: number; refresh: () => Promise<void>; changed: () => void };
const Context = createContext<State>({ ready: false, profile: null, language: 'en', setLanguage: () => {}, appearance: 'shore', setAppearance: async () => {}, measurementSystem: 'metric', setMeasurementSystem: async () => {}, revision: 0, refresh: async () => {}, changed: () => {} });
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false), [profile, setProfile] = useState<Profile | null>(null), [language, setLanguage] = useState<Language>('en'), [revision, setRevision] = useState(0);
  const [measurementSystem, applyMeasurementSystem] = useState<MeasurementSystem>('metric');
  // VoltThemeProvider is mounted above both Clerk branches. App state only
  // persists the selected appearance; it must not become a second owner that
  // resets the value while a session or local account is being prepared.
  const { appearance, setAppearance: applyAppearance } = useVoltTheme();
  const refresh = useCallback(async () => {
    const [next, preferences] = await Promise.all([repo.profile(), repo.preferences()]);
    const savedAppearance = parseAppearance(preferences.find(item => item.key === 'appearance')?.value);
    applyAppearance(savedAppearance);
    applyMeasurementSystem(parseMeasurementSystem(preferences.find(item => item.key === 'measurement_system')?.value));
    setProfile(next); setLanguage(next?.language ?? 'en'); setRevision(x => x + 1); setReady(true);
  }, [applyAppearance]);
  const setAppearance = useCallback(async (next: Appearance) => {
    const previous = appearance;
    applyAppearance(next);
    try { await repo.setPreference('appearance', next); }
    catch (error) { applyAppearance(previous); throw error; }
  }, [appearance, applyAppearance]);
  const setMeasurementSystem = useCallback(async (next: MeasurementSystem) => {
    const previous = measurementSystem;
    applyMeasurementSystem(next);
    try { await repo.setPreference('measurement_system', next); }
    catch (error) { applyMeasurementSystem(previous); throw error; }
  }, [measurementSystem]);
  useEffect(() => { setActiveLanguage(language); }, [language]);
  useEffect(() => { refresh().catch(() => console.warn('Profile refresh failed')); }, [refresh]);
  useEffect(() => { if (ready && profile) reconcileReminders().catch(() => console.warn('Reminder update failed')); }, [ready, profile]);
  useEffect(() => { if (!ready || !profile) return; const listener = AppState.addEventListener('change', state => { if (state === 'active') reconcileReminders().catch(() => console.warn('Reminder update failed')); }); return () => listener.remove(); }, [ready, profile]);
  return <Context.Provider value={{ ready, profile, language, setLanguage, appearance, setAppearance, measurementSystem, setMeasurementSystem, revision, refresh, changed: () => setRevision(x => x + 1) }}>{children}</Context.Provider>;
}
export const useApp = () => useContext(Context);
