export type Appearance = 'shore' | 'deep' | 'abyss';

export type Palette = {
  bg: string;
  card: string;
  card2: string;
  elevated: string;
  text: string;
  muted: string;
  subtle: string;
  accent: string;
  accentText: string;
  accentInk: string;
  titleAccent: string;
  danger: string;
  dangerText: string;
  border: string;
  borderStrong: string;
  line3: string;
  lime: string;
  blue: string;
  paleBlue: string;
  ice: string;
  softLime: string;
  navBackground: string;
  navActiveBackground: string;
  navActiveText: string;
  navActiveIcon: string;
  softLimeText: string;
  chartTrack: string;
  surfaceWarm: string;
  // Compatibility names used by existing screens while they are migrated.
  sun: string;
  coral: string;
  lilac: string;
  mint: string;
  sky: string;
  ink: string;
};

const palettes: Record<Appearance, Palette> = {
  shore: {
    bg: '#F5F9FF', card: '#FFFFFF', card2: '#EEF6FF', elevated: '#DDEAFB',
    text: '#0B1446', muted: '#4A5679', subtle: '#5F6A8C',
    accent: '#1D2E8F', accentText: '#FFFFFF', accentInk: '#0B1446', titleAccent: '#1D2E8F', danger: '#B42318', dangerText: '#FFFFFF',
    border: '#E3ECF8', borderStrong: '#CCDAEE', line3: '#8796B8',
    lime: '#DFFF1F', blue: '#9CCBFF', paleBlue: '#C9E3FF', ice: '#EEF6FF', softLime: '#F6FFC2',
    navBackground: 'rgba(255,255,255,0.94)', navActiveBackground: '#1D2E8F', navActiveText: '#FFFFFF', navActiveIcon: '#DFFF1F', softLimeText: '#0B1446',
    chartTrack: '#E3ECFA', surfaceWarm: '#F6FFC2',
    sun: '#DFFF1F', coral: '#9CCBFF', lilac: '#C9E3FF', mint: '#F6FFC2', sky: '#EEF6FF', ink: '#0B1446',
  },
  abyss: {
    bg: '#000000', card: '#0B0E1A', card2: '#141A2E', elevated: '#1E2642',
    text: '#EEF6FF', muted: '#A8B0C8', subtle: '#7E87A3',
    accent: '#9CCBFF', accentText: '#0B1446', accentInk: '#0B1446', titleAccent: '#DFFF1F', danger: '#FF8A8A', dangerText: '#0B1446',
    border: '#151B30', borderStrong: '#252D4A', line3: '#454F75',
    lime: '#DFFF1F', blue: '#9CCBFF', paleBlue: '#C9E3FF', ice: '#1E2642', softLime: 'rgba(223,255,31,0.1)',
    navBackground: 'rgba(11,20,70,0.96)', navActiveBackground: '#DFFF1F', navActiveText: '#0B1446',
    chartTrack: 'rgba(255,255,255,0.08)', surfaceWarm: 'rgba(223,255,31,0.1)',
    sun: '#DFFF1F', coral: '#9CCBFF', lilac: '#1E2642', mint: '#9CCBFF', sky: '#141A2E', ink: '#EEF6FF',
    navActiveIcon: '#0B1446', softLimeText: '#DFFF1F',
  },
  deep: {
    bg: '#0A0E26', card: '#121A3D', card2: '#1A2350', elevated: '#252F66',
    text: '#EEF6FF', muted: '#A9B3DA', subtle: '#8691C2',
    accent: '#9CCBFF', accentText: '#0B1446', accentInk: '#0B1446', titleAccent: '#DFFF1F', danger: '#FF8A8A', dangerText: '#0B1446',
    border: '#1B2350', borderStrong: '#2A3470', line3: '#4B5594',
    lime: '#DFFF1F', blue: '#9CCBFF', paleBlue: '#C9E3FF', ice: '#1A2350', softLime: 'rgba(223,255,31,0.12)',
    navBackground: 'rgba(11,20,70,0.96)', navActiveBackground: '#9CCBFF', navActiveText: '#0B1446',
    chartTrack: 'rgba(255,255,255,0.1)', surfaceWarm: 'rgba(223,255,31,0.12)',
    sun: '#DFFF1F', coral: '#9CCBFF', lilac: '#1A2350', mint: '#9CCBFF', sky: '#1A2350', ink: '#EEF6FF',
    navActiveIcon: '#0B1446', softLimeText: '#DFFF1F',
  },
};

let activeAppearance: Appearance = 'shore';
/**
 * A compatibility view for code that cannot use React context (for example,
 * error-boundary fallbacks). Rendered UI reads the same palette through
 * VoltThemeProvider, which is the source of truth.
 */
export let colors: Palette = palettes[activeAppearance];

export function setAppearancePalette(appearance: Appearance) {
  activeAppearance = appearance;
  colors = palettes[appearance];
}

export function getActiveAppearance(): Appearance {
  return activeAppearance;
}

export function getAppearancePalette(appearance: Appearance): Readonly<Palette> {
  return palettes[appearance];
}

export function parseAppearance(value: string | undefined): Appearance {
  return value === 'abyss' || value === 'deep' ? value : 'shore';
}

export const spacing = { xs: 4, sm: 8, md: 12, base: 16, card: 18, screen: 18, section: 24, major: 32 } as const;
export const radii = { small: 14, input: 18, card: 24, large: 30, pill: 999 } as const;
export const shadows = {
  card: { shadowColor: '#0B1446', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  dock: { shadowColor: '#0B1446', shadowOpacity: 0.14, shadowRadius: 26, shadowOffset: { width: 0, height: 10 }, elevation: 9 },
} as const;
export const fonts = { display: 'FitDisplay', displayHeavy: 'FitDisplayHeavy', body: 'FitBody', medium: 'FitBodyMedium', semibold: 'FitBodySemiBold', bold: 'FitBodyBold', mono: 'FitBodySemiBold', arabic: 'FitArabic', arabicBold: 'FitArabicBold' } as const;
