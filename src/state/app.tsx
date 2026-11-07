import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { repo } from '../data/db';
import { Language, Profile } from '../core/types';
import { setActiveLanguage } from '../core/i18n';
import { reconcileReminders } from '../services/reminders';
type State = { ready: boolean; profile: Profile | null; language: Language; setLanguage: (language: Language) => void; revision: number; refresh: () => Promise<void>; changed: () => void };
const Context = createContext<State>({ ready: false, profile: null, language: 'en', setLanguage: () => {}, revision: 0, refresh: async () => {}, changed: () => {} });
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false), [profile, setProfile] = useState<Profile | null>(null), [language, setLanguage] = useState<Language>('en'), [revision, setRevision] = useState(0);
  const refresh = useCallback(async () => { const next = await repo.profile(); setProfile(next); setLanguage(next?.language ?? 'en'); setRevision(x => x + 1); setReady(true); }, []);
  useEffect(() => { setActiveLanguage(language); }, [language]);
  useEffect(() => { refresh().catch(console.error); }, [refresh]);
  useEffect(() => { if (ready && profile) reconcileReminders().catch(console.error); }, [ready, profile]);
  useEffect(() => { if (!ready || !profile) return; const listener = AppState.addEventListener('change', state => { if (state === 'active') reconcileReminders().catch(console.error); }); return () => listener.remove(); }, [ready, profile]);
  return <Context.Provider value={{ ready, profile, language, setLanguage, revision, refresh, changed: () => setRevision(x => x + 1) }}>{children}</Context.Provider>;
}
export const useApp = () => useContext(Context);
