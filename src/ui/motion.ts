import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion as useNativeReducedMotion } from 'react-native-reanimated';

const MotionContext = createContext(true);
type TabTransition = { route: string; sequence: number };
type TabMotionContextValue = { transition: TabTransition; reveal: (route: string) => void };
const TabMotionContext = createContext<TabMotionContextValue | null>(null);

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const systemReduced = useNativeReducedMotion();
  const [reduced, setReduced] = useState(systemReduced);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduced(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return React.createElement(MotionContext.Provider, { value: reduced }, children);
}
export const useReducedMotion = () => useContext(MotionContext);

export function TabMotionProvider({ children }: { children: React.ReactNode }) {
  const [transition, setTransition] = useState<TabTransition>({ route: '', sequence: 0 });
  const reveal = useCallback((route: string) => {
    setTransition(current => ({ route, sequence: current.sequence + 1 }));
  }, []);
  // One context update per tab tap. (An unused `activeRoute` state used to add a second
  // update, re-rendering every mounted tab Page again right after each switch.)
  const value = useMemo(() => ({ transition, reveal }), [transition, reveal]);
  return React.createElement(TabMotionContext.Provider, { value }, children);
}

const idleTabMotion: TabMotionContextValue = { transition: { route: '', sequence: 0 }, reveal: (_route: string) => {} };
export function useTabMotion() {
  return useContext(TabMotionContext) ?? idleTabMotion;
}
