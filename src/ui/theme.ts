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
  /** Prototype Volt tokens (final effective appearance values). */
  q1: string; q2: string; q3: string; qTrack: string; qCore: string;
  c8: string; c8Line: string; soft1: string; soft2: string; chipBg: string; chipFg: string;
  g1: string; g2: string; plInk: string; plGlow: string;
  hsRim: string; hsTrack: string; hsDot: string; hsIb: string; hsIc: string;
  mc1: string; mb1: string; mc2: string; mb2: string; mc3: string; mb3: string; mbt: string;
  lv1: string; lv2: string; lv3: string; lgi: string;
  pgBar: string; pgHl: string; pgSoft: string; pgUp: string;
  heroCard: string; navShadow: string;
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
    navBackground: 'rgba(255,255,255,0.92)', navActiveBackground: '#1D2E8F', navActiveText: '#FFFFFF', navActiveIcon: '#DFFF1F', softLimeText: '#0B1446',
    chartTrack: '#E3ECFA', surfaceWarm: '#F6FFC2',
    q1: '#1D2E8F', q2: '#9CCBFF', q3: '#DFFF1F', qTrack: '#EEF6FF', qCore: '#F5F9FF',
    c8: '#FFFFFF', c8Line: '#E4EEFB', soft1: '#EEF6FF', soft2: '#F6FFC2', chipBg: '#F6FFC2', chipFg: '#1D2E8F',
    g1: '#1D2E8F', g2: '#0B1446', plInk: '#FFFFFF', plGlow: 'rgba(29,46,143,0.28)',
    hsRim: '#C9E3FF', hsTrack: '#FFFFFF', hsDot: '#9CCBFF', hsIb: '#DFFF1F', hsIc: '#1D2E8F',
    mc1: '#EEF6FF', mb1: '#1D2E8F', mc2: '#F6FFC2', mb2: '#1D2E8F', mc3: '#E3F1FF', mb3: '#9CCBFF', mbt: 'rgba(255,255,255,0.85)',
    lv1: '#C9E3FF', lv2: '#9CCBFF', lv3: '#1D2E8F', lgi: '#F1F5FC',
    pgBar: '#1D2E8F', pgHl: '#DFFF1F', pgSoft: 'rgba(29,46,143,0.08)', pgUp: '#1D2E8F',
    heroCard: '#1D2E8F', navShadow: '#0B1446',
    sun: '#DFFF1F', coral: '#9CCBFF', lilac: '#C9E3FF', mint: '#F6FFC2', sky: '#EEF6FF', ink: '#0B1446',
  },
  abyss: {
    bg: '#000000', card: '#0B0E1A', card2: '#141A2E', elevated: '#1E2642',
    text: '#EEF6FF', muted: '#A8B0C8', subtle: '#7E87A3',
    accent: '#9CCBFF', accentText: '#0B1446', accentInk: '#0B1446', titleAccent: '#DFFF1F', danger: '#FF8A8A', dangerText: '#0B1446',
    border: '#151B30', borderStrong: '#252D4A', line3: '#454F75',
    lime: '#DFFF1F', blue: '#9CCBFF', paleBlue: '#C9E3FF', ice: '#1E2642', softLime: 'rgba(223,255,31,0.1)',
    navBackground: 'rgba(11,14,26,0.94)', navActiveBackground: '#DFFF1F', navActiveText: '#0B1446',
    chartTrack: 'rgba(255,255,255,0.08)', surfaceWarm: 'rgba(223,255,31,0.1)',
    q1: '#DFFF1F', q2: '#9CCBFF', q3: '#C9E3FF', qTrack: 'rgba(255,255,255,0.08)', qCore: 'rgba(255,255,255,0.03)',
    c8: '#0B0E1A', c8Line: 'rgba(255,255,255,0.06)', soft1: 'rgba(156,203,255,0.12)', soft2: 'rgba(223,255,31,0.1)', chipBg: 'rgba(223,255,31,0.14)', chipFg: '#DFFF1F',
    g1: '#DFFF1F', g2: '#9CCBFF', plInk: '#0B1446', plGlow: 'rgba(223,255,31,0.25)',
    hsRim: '#1E2642', hsTrack: '#141A2E', hsDot: '#454F75', hsIb: '#1E2642', hsIc: '#DFFF1F',
    mc1: 'rgba(156,203,255,0.14)', mb1: '#9CCBFF', mc2: 'rgba(223,255,31,0.12)', mb2: '#DFFF1F', mc3: 'rgba(201,227,255,0.1)', mb3: '#C9E3FF', mbt: 'rgba(255,255,255,0.1)',
    lv1: 'rgba(156,203,255,0.45)', lv2: '#9CCBFF', lv3: '#DFFF1F', lgi: 'rgba(255,255,255,0.03)',
    pgBar: '#9CCBFF', pgHl: '#DFFF1F', pgSoft: 'rgba(156,203,255,0.1)', pgUp: '#DFFF1F',
    heroCard: '#1A2A80', navShadow: '#000000',
    sun: '#DFFF1F', coral: '#9CCBFF', lilac: '#1E2642', mint: '#9CCBFF', sky: '#141A2E', ink: '#EEF6FF',
    navActiveIcon: '#0B1446', softLimeText: '#DFFF1F',
  },
  deep: {
    bg: '#0A0E26', card: '#121A3D', card2: '#1A2350', elevated: '#252F66',
    text: '#EEF6FF', muted: '#A9B3DA', subtle: '#8691C2',
    accent: '#9CCBFF', accentText: '#0B1446', accentInk: '#0B1446', titleAccent: '#DFFF1F', danger: '#FF8A8A', dangerText: '#0B1446',
    border: '#1B2350', borderStrong: '#2A3470', line3: '#4B5594',
    lime: '#DFFF1F', blue: '#9CCBFF', paleBlue: '#C9E3FF', ice: '#1A2350', softLime: 'rgba(223,255,31,0.12)',
    navBackground: 'rgba(18,26,61,0.92)', navActiveBackground: '#DFFF1F', navActiveText: '#0B1446',
    chartTrack: 'rgba(255,255,255,0.1)', surfaceWarm: 'rgba(223,255,31,0.12)',
    q1: '#DFFF1F', q2: '#9CCBFF', q3: '#C9E3FF', qTrack: 'rgba(255,255,255,0.08)', qCore: 'rgba(255,255,255,0.03)',
    c8: '#121A3D', c8Line: 'rgba(255,255,255,0.06)', soft1: 'rgba(156,203,255,0.12)', soft2: 'rgba(223,255,31,0.1)', chipBg: 'rgba(223,255,31,0.14)', chipFg: '#DFFF1F',
    g1: '#DFFF1F', g2: '#9CCBFF', plInk: '#0B1446', plGlow: 'rgba(223,255,31,0.25)',
    hsRim: '#252F66', hsTrack: '#1A2350', hsDot: '#4B5594', hsIb: '#252F66', hsIc: '#DFFF1F',
    mc1: 'rgba(156,203,255,0.14)', mb1: '#9CCBFF', mc2: 'rgba(223,255,31,0.12)', mb2: '#DFFF1F', mc3: 'rgba(201,227,255,0.1)', mb3: '#C9E3FF', mbt: 'rgba(255,255,255,0.1)',
    lv1: 'rgba(156,203,255,0.45)', lv2: '#9CCBFF', lv3: '#DFFF1F', lgi: 'rgba(255,255,255,0.03)',
    pgBar: '#9CCBFF', pgHl: '#DFFF1F', pgSoft: 'rgba(156,203,255,0.1)', pgUp: '#DFFF1F',
    heroCard: '#22379F', navShadow: '#000000',
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

export const spacing = { xs: 4, sm: 8, md: 12, base: 16, card: 16, screen: 18, section: 24, major: 32 } as const;
/** Prototype motion curves: --out and --spring. */
export const easing = { out: [0.22, 1, 0.36, 1] as const, spring: [0.34, 1.56, 0.64, 1] as const };
export const radii = { small: 14, input: 18, row: 20, tile: 20, card: 26, large: 30, pill: 999 } as const;
export const shadows = {
  card: { shadowColor: '#0B1446', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  dock: { shadowColor: '#0B1446', shadowOpacity: 0.14, shadowRadius: 26, shadowOffset: { width: 0, height: 10 }, elevation: 9 },
} as const;
export const fonts = { display: 'FitDisplay', displayHeavy: 'FitDisplayHeavy', body: 'FitBody', medium: 'FitBodyMedium', semibold: 'FitBodySemiBold', bold: 'FitBodyBold', mono: 'FitBodySemiBold', arabic: 'FitArabic', arabicBold: 'FitArabicBold' } as const;
