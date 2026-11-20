import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { repo } from '../data/db';
import { Language, Profile } from '../core/types';
import { setActiveLanguage } from '../core/i18n';
import { reconcileReminders } from '../services/reminders';
import { Appearance, parseAppearance, parseStyleMode, resolveStyle, type Style, type StyleMode } from '../ui/theme';
import { parseSex, prefKeys, type Sex } from '../core/nutritionTargets';
import { useVoltTheme } from '../ui/VoltThemeProvider';
import { parseMeasurementSystem, type MeasurementSystem } from '../core/foodUnits';
import { TERMS_VERSION } from '../../shared/legalVersions';
/** Preference key for the Personalization style choice ('profile' | 'volt' | 'lotus'). Synced with other preferences. */
export const STYLE_MODE_KEY = 'style_mode';
type State = { ready: boolean; profile: Profile | null; legalAccepted: boolean; ageRejected: boolean; language: Language; setLanguage: (language: Language) => void; measurementSystem: MeasurementSystem; setMeasurementSystem: (system: MeasurementSystem) => Promise<void>; revision: number; refresh: () => Promise<void>; changed: () => void };
type PersonalizationState = { appearance: Appearance; setAppearance: (appearance: Appearance) => Promise<void>; styleMode: StyleMode; style: Style; setStyleMode: (mode: StyleMode) => Promise<void>; sex: Sex | null; setSex: (sex: Sex) => Promise<void> };
const Context = createContext<State>({ ready: false, profile: null, legalAccepted: false, ageRejected: false, language: 'en', setLanguage: () => {}, measurementSystem: 'metric', setMeasurementSystem: async () => {}, revision: 0, refresh: async () => {}, changed: () => {} });
const PersonalizationContext = createContext<PersonalizationState>({ appearance: 'shore', setAppearance: async () => {}, styleMode: 'profile', style: 'volt', setStyleMode: async () => {}, sex: null, setSex: async () => {} });
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false), [profile, setProfile] = useState<Profile | null>(null), [language, setLanguage] = useState<Language>('en'), [revision, setRevision] = useState(0);
  const [measurementSystem, applyMeasurementSystem] = useState<MeasurementSystem>('metric');
  const [legalAccepted, setLegalAccepted] = useState(false), [ageRejected, setAgeRejected] = useState(false);
  // VoltThemeProvider is mounted above both Clerk branches. App state only
  // persists the selected appearance; it must not become a second owner that
  // resets the value while a session or local account is being prepared.
  const { appearance, setAppearance: applyAppearance, style, setStyle: applyStyle } = useVoltTheme();
  const [styleMode, applyStyleMode] = useState<StyleMode>('profile');
  const [sex, applySex] = useState<Sex | null>(null);
  const refresh = useCallback(async () => {
    const [next, preferences] = await Promise.all([repo.profile(), repo.preferences()]);
    const savedAppearance = parseAppearance(preferences.find(item => item.key === 'appearance')?.value);
    applyAppearance(savedAppearance);
    const savedMode = parseStyleMode(preferences.find(item => item.key === STYLE_MODE_KEY)?.value);
    const savedSex = parseSex(preferences.find(item => item.key === prefKeys.sex)?.value);
    applyStyleMode(savedMode); applySex(savedSex); applyStyle(resolveStyle(savedMode, savedSex));
    applyMeasurementSystem(parseMeasurementSystem(preferences.find(item => item.key === 'measurement_system')?.value));
    setLegalAccepted(preferences.find(item => item.key === 'terms_accepted_version')?.value === TERMS_VERSION);
    setAgeRejected(preferences.find(item => item.key === 'age_rejected')?.value === 'true');
    setProfile(next); setLanguage(next?.language ?? 'en'); setRevision(x => x + 1); setReady(true);
  }, [applyAppearance, applyStyle]);
  // Style only changes colours; it never writes profile, sex or fitness data.
  const setStyleMode = useCallback(async (next: StyleMode) => {
    const previous = styleMode;
    applyStyleMode(next); applyStyle(resolveStyle(next, sex));
    try { await repo.setPreference(STYLE_MODE_KEY, next); }
    catch (error) { applyStyleMode(previous); applyStyle(resolveStyle(previous, sex)); throw error; }
  }, [styleMode, sex, applyStyle]);
  // The existing body.sex preference (also used for calorie estimates). 'Match my profile' follows it.
  const setSex = useCallback(async (next: Sex) => {
    const previous = sex;
    applySex(next); applyStyle(resolveStyle(styleMode, next));
    try { await repo.setPreference(prefKeys.sex, next); }
    catch (error) { applySex(previous); applyStyle(resolveStyle(styleMode, previous)); throw error; }
  }, [sex, styleMode, applyStyle]);
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
  // Habits History: finalize days that ended while the app was closed or in the background.
  const reconcileHistory = useCallback(() => { repo.reconcileHabitHistory().then(written => { if (written) setRevision(x => x + 1); }).catch(() => console.warn('History update failed')); }, []);
  useEffect(() => { if (ready && profile) { reconcileReminders().catch(() => console.warn('Reminder update failed')); reconcileHistory(); } }, [ready, profile, reconcileHistory]);
  useEffect(() => { if (!ready || !profile) return; const listener = AppState.addEventListener('change', state => { if (state === 'active') { reconcileReminders().catch(() => console.warn('Reminder update failed')); reconcileHistory(); } }); return () => listener.remove(); }, [ready, profile, reconcileHistory]);
  // Theme changes used to recreate the broad app context, invalidating every screen that reads
  // profile, language, or revision. Keep visual preferences in a narrow context instead.
  const changed = useCallback(() => setRevision(x => x + 1), []);
  const state = useMemo<State>(() => ({ ready, profile, legalAccepted, ageRejected, language, setLanguage, measurementSystem, setMeasurementSystem, revision, refresh, changed }), [ready, profile, legalAccepted, ageRejected, language, measurementSystem, setMeasurementSystem, revision, refresh, changed]);
  const personalization = useMemo<PersonalizationState>(() => ({ appearance, setAppearance, styleMode, style, setStyleMode, sex, setSex }), [appearance, setAppearance, styleMode, style, setStyleMode, sex, setSex]);
  return <PersonalizationContext.Provider value={personalization}><Context.Provider value={state}>{children}</Context.Provider></PersonalizationContext.Provider>;
}
export const useApp = () => useContext(Context);
export const usePersonalization = () => useContext(PersonalizationContext);
