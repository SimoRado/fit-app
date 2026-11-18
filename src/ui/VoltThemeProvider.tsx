import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { DefaultTheme, ThemeProvider as RouterThemeProvider, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Appearance, getAppearancePalette, getActiveStyle, Palette, parseAppearance, setThemePalette, type Style } from './theme';

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
  const setAppearance = useCallback((next: Appearance) => {
    setTheme(current => {
      const appearance = parseAppearance(next);
      setThemePalette(current.style, appearance);
      return current.appearance === appearance ? current : { ...current, appearance };
    });
  }, []);
  const setStyle = useCallback((next: Style) => {
    setTheme(current => {
      const style: Style = next === 'lotus' ? 'lotus' : 'volt';
      setThemePalette(style, current.appearance);
      return current.style === style ? current : { ...current, style };
    });
  }, []);
  const { style, appearance } = theme;
  const palette = getAppearancePalette(appearance, style);
  const value = useMemo<VoltThemeState>(() => ({ appearance, style, palette, setAppearance, setStyle }), [appearance, style, palette, setAppearance, setStyle]);
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
