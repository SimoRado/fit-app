import React, { createContext, Profiler, useCallback, useContext, useEffect, useMemo, useRef, useState, type ProfilerOnRenderCallback } from 'react';
import { DefaultTheme, ThemeProvider as RouterThemeProvider, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Appearance, getAppearancePalette, getActiveStyle, Palette, parseAppearance, setThemePalette, type Style } from './theme';
import { perfMark, perfNow } from '../core/perf';

type VoltThemeState = {
  appearance: Appearance;
  style: Style;
  palette: Readonly<Palette>;
  setAppearance: (appearance: Appearance) => void;
  setStyle: (style: Style) => void;
};

const fallbackTheme: VoltThemeState = {
  appearance: 'shore',
  style: getActiveStyle(),
  palette: getAppearancePalette('shore'),
  setAppearance: appearance => setThemePalette(getActiveStyle(), appearance),
  setStyle: style => setThemePalette(style, 'shore'),
};

const VoltThemeContext = createContext<VoltThemeState>(fallbackTheme);

function navigationTheme(palette: Readonly<Palette>, appearance: Appearance): Theme {
  return {
    ...DefaultTheme,
    dark: appearance !== 'shore',
    colors: {
      primary: palette.accent,
      background: palette.bg,
      card: palette.card,
      text: palette.text,
      border: palette.border,
      notification: palette.lime,
    },
  };
}

/** The only state owner for the rendered style (Volt/Lotus) and appearance (light/dark). */
export function VoltThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<{ style: Style; appearance: Appearance }>(() => ({ style: getActiveStyle(), appearance: 'shore' }));
  const pendingMark = useRef<{ label: string; startedAt: number; committed: boolean } | null>(null);
  const setAppearance = useCallback((next: Appearance) => {
    setTheme(current => {
      const appearance = parseAppearance(next);
      setThemePalette(current.style, appearance);
      if (current.appearance === appearance) return current;
      pendingMark.current = { label: `${current.style} ${current.appearance} → ${current.style} ${appearance}`, startedAt: perfNow(), committed: false };
      return { ...current, appearance };
    });
  }, []);
  const setStyle = useCallback((next: Style) => {
    setTheme(current => {
      const style: Style = next === 'lotus' ? 'lotus' : 'volt';
      setThemePalette(style, current.appearance);
      if (current.style === style) return current;
      pendingMark.current = { label: `${current.style} ${current.appearance} → ${style} ${current.appearance}`, startedAt: perfNow(), committed: false };
      return { ...current, style };
    });
  }, []);
  const { style, appearance } = theme;
  const palette = getAppearancePalette(appearance, style);
  const value = useMemo<VoltThemeState>(() => ({ appearance, style, palette, setAppearance, setStyle }), [appearance, style, palette, setAppearance, setStyle]);
  const routerTheme = useMemo(() => navigationTheme(palette, appearance), [appearance, palette]);
  const onThemeRender = useCallback<ProfilerOnRenderCallback>((_id, _phase, actualDuration) => {
    const mark = pendingMark.current;
    if (!mark || mark.committed || typeof __DEV__ === 'undefined' || !__DEV__) return;
    mark.committed = true;
    console.info(`[perf] theme ${mark.label} React commit: ${Math.round(actualDuration)} ms`);
  }, []);
  useEffect(() => {
    const mark = pendingMark.current;
    if (!mark) return;
    const frame = requestAnimationFrame(() => {
      perfMark(`theme ${mark.label} first frame`, mark.startedAt);
      if (pendingMark.current === mark) pendingMark.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [appearance, style]);

  return <VoltThemeContext.Provider value={value}>
    <RouterThemeProvider value={routerTheme}>
      <StatusBar animated style={appearance === 'shore' ? 'dark' : 'light'}/>
      <Profiler id="theme-tree" onRender={onThemeRender}>{children}</Profiler>
    </RouterThemeProvider>
  </VoltThemeContext.Provider>;
}

export function useVoltTheme() {
  return useContext(VoltThemeContext);
}
