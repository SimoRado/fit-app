import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { DefaultTheme, ThemeProvider as RouterThemeProvider, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Appearance, getAppearancePalette, Palette, parseAppearance, setAppearancePalette } from './theme';

type VoltThemeState = {
  appearance: Appearance;
  palette: Readonly<Palette>;
  setAppearance: (appearance: Appearance) => void;
};

const fallbackTheme: VoltThemeState = {
  appearance: 'shore',
  palette: getAppearancePalette('shore'),
  setAppearance: setAppearancePalette,
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

/** The only state owner for a rendered Volt appearance. */
export function VoltThemeProvider({ children }: { children: React.ReactNode }) {
  const [appearance, setAppearanceState] = useState<Appearance>('shore');
  const setAppearance = useCallback((next: Appearance) => {
    const resolved = parseAppearance(next);
    setAppearancePalette(resolved);
    setAppearanceState(resolved);
  }, []);
  const palette = getAppearancePalette(appearance);
  const value = useMemo<VoltThemeState>(() => ({ appearance, palette, setAppearance }), [appearance, palette, setAppearance]);
  const routerTheme = useMemo(() => navigationTheme(palette, appearance), [appearance, palette]);

  return <VoltThemeContext.Provider value={value}>
    <RouterThemeProvider value={routerTheme}>
      <StatusBar animated style={appearance === 'shore' ? 'dark' : 'light'}/>
      {children}
    </RouterThemeProvider>
  </VoltThemeContext.Provider>;
}

export function useVoltTheme() {
  return useContext(VoltThemeContext);
}
