export type Appearance = 'shore' | 'deep' | 'abyss';

/** A multi-stop gradient: colors with offsets in 0..1. */
export type GradientStops = readonly { offset: number; color: string; opacity?: number }[];

export type Palette = {
  /** True for the light (Shore) appearance. Use this instead of comparing `bg` to a hex. */
  light: boolean;
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
  dangerSoft: string;
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
  /** Prototype tokens (final effective appearance values). */
  q1: string; q2: string; q3: string; qTrack: string; qCore: string;
  c8: string; c8Line: string; soft1: string; soft2: string; chipBg: string; chipFg: string;
  g1: string; g2: string; plInk: string; plGlow: string;
  hsRim: string; hsTrack: string; hsDot: string; hsIb: string; hsIc: string;
  /** Page background line art (prototype `--pat-c` / `--pat-o`). */
  pattern: string; patternOpacity: number;
  mc1: string; mb1: string; mc2: string; mb2: string; mc3: string; mb3: string; mbt: string;
  lv1: string; lv2: string; lv3: string; lgi: string;
  pgBar: string; pgHl: string; pgSoft: string; pgUp: string;
  heroCard: string; navShadow: string;
  /** Lotus additions (prototype `html.x-f`). */
  /** `--lt-candy`: selected pills, active tab, accent buttons. */
  candy: GradientStops;
  /** Text/icon colour drawn on `candy`. */
  candyInk: string;
  /** `--lt-glow`: coloured drop shadow under candy surfaces. */
  candyGlow: string;
  /** `--lt-hero`: the Progress weight card and other hero surfaces. */
  hero: GradientStops;
  heroShadow: string;
  /** `.chip8` gradient + ink. */
  chipStops: GradientStops; chipInk: string;
  /** `.sc8b` round quick-action buttons. */
  orbFrom: string; orbTo: string; orbRing: string; orbIcon: string;
  /** Card drop shadow colour (`rgba(73,16,139,.16)` in Shore). */
  cardShadow: string;
  /** Header glows painted on the page (`.viewport` radial gradients). */
  glowA: string; glowB: string;
  /** Weight detail chart area fill (`--k-5C9BD6`). */
  chartFill: string;
  // Compatibility names used by existing screens while they are migrated.
  sun: string;
  coral: string;
  lilac: string;
  mint: string;
  sky: string;
  ink: string;
};

/**
 * Cubyfit Lotus brand constants, extracted from the designer's final prototype
 * (`Cubyfit-VoltVFinal.html`, `html.x-f`). Use these for fixed artwork (share
 * cards, logo, illustrations) that must not follow the appearance.
 */
export const brand = {
  /** Deep violet ink (headings, body text in Shore). */
  ink: '#2A0950',
  /** Indigo (`--lt-hero` start, logo head). */
  indigo: '#49108B',
  /** Primary violet. */
  violet: '#7E30E1',
  /** Mid stop of the candy gradient. */
  purple: '#B04FE4',
  /** Orchid pink (secondary accent). */
  orchid: '#E26EE5',
  /** Lavender (charts, secondary rings). */
  lavender: '#B98AF0',
  /** Pale lilac surface. */
  lilac: '#E6D6FA',
  /** Soft lavender surface. */
  mist: '#F1EBFC',
  /** Pale pink surface. */
  blush: '#FBE4FB',
  /** Page background (snow). */
  snow: '#F3F8FF',
  white: '#FFFFFF',
  /** Abyss surfaces. */
  night: '#12061F',
  nightCard: '#1C0B30',
  nightRaised: '#261041',
} as const;

/** `rgba()` from a `#RRGGBB` colour. */
export function alpha(hex: string, opacity: number) {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${opacity})`;
}

const candyLight: GradientStops = [{ offset: 0, color: brand.violet }, { offset: 0.55, color: brand.purple }, { offset: 1, color: brand.orchid }];
const candyDark: GradientStops = [{ offset: 0, color: brand.orchid }, { offset: 1, color: '#B887F5' }];
// `linear-gradient(140deg,#49108B 0%,#7E30E1 55%,#E26EE5 115%)`: the 100% colour is interpolated (#C95EE4).
const hero: GradientStops = [{ offset: 0, color: brand.indigo }, { offset: 0.55, color: brand.violet }, { offset: 1, color: '#C95EE4' }];

const palettes: Record<Appearance, Palette> = {
  shore: {
    light: true,
    bg: '#F3F8FF', card: '#FFFFFF', card2: '#F1EBFC', elevated: '#E8DCF8',
    text: '#2A0950', muted: '#5B5075', subtle: '#6E6588',
    accent: '#7E30E1', accentText: '#FFFFFF', accentInk: '#2A0950', titleAccent: '#7E30E1', danger: '#B42318', dangerText: '#FFFFFF', dangerSoft: '#FDECEA',
    border: '#ECE4F8', borderStrong: '#DAD5E9', line3: '#9990B4',
    lime: '#E26EE5', blue: '#B98AF0', paleBlue: '#E6D6FA', ice: '#F1EBFC', softLime: '#FBE4FB',
    navBackground: 'rgba(255,255,255,0.92)', navActiveBackground: '#7E30E1', navActiveText: '#FFFFFF', navActiveIcon: '#FFFFFF', softLimeText: '#2A0950',
    chartTrack: '#ECE9F8', surfaceWarm: '#FBE4FB',
    q1: '#7E30E1', q2: '#B98AF0', q3: '#E26EE5', qTrack: '#F1EBFC', qCore: '#F3F8FF',
    c8: '#FFFFFF', c8Line: '#ECE3F8', soft1: '#F1EBFC', soft2: '#FBE4FB', chipBg: '#FBE4FB', chipFg: '#7E30E1',
    g1: '#7E30E1', g2: '#49108B', plInk: '#FFFFFF', plGlow: 'rgba(126,48,225,0.34)',
    hsRim: '#E6D6FA', hsTrack: '#FFFFFF', hsDot: '#B98AF0', hsIb: '#E26EE5', hsIc: '#7E30E1',
    pattern: '#7E30E1', patternOpacity: 0.07,
    mc1: '#F1EBFC', mb1: '#7E30E1', mc2: '#FBE4FB', mb2: '#7E30E1', mc3: '#F3E9FE', mb3: '#B98AF0', mbt: 'rgba(255,255,255,0.85)',
    lv1: '#E6D6FA', lv2: '#B98AF0', lv3: '#7E30E1', lgi: '#F5F3FC',
    pgBar: '#7E30E1', pgHl: '#E26EE5', pgSoft: 'rgba(126,48,225,0.08)', pgUp: '#7E30E1',
    heroCard: '#7E30E1', navShadow: '#2A0950',
    candy: candyLight, candyInk: '#FFFFFF', candyGlow: 'rgba(126,48,225,0.34)',
    hero, heroShadow: '#49108B',
    chipStops: [{ offset: 0, color: '#FBE4FB' }, { offset: 1, color: '#EFE3FD' }], chipInk: '#49108B',
    orbFrom: '#FFFFFF', orbTo: '#F1E6FD', orbRing: '#E26EE5', orbIcon: '#7E30E1',
    cardShadow: '#49108B',
    glowA: 'rgba(226,110,229,0.16)', glowB: 'rgba(126,48,225,0.09)',
    chartFill: '#9D87D1',
    sun: '#E26EE5', coral: '#B98AF0', lilac: '#E6D6FA', mint: '#FBE4FB', sky: '#F1EBFC', ink: '#2A0950',
  },
  abyss: {
    light: false,
    bg: '#12061F', card: '#1C0B30', card2: '#261041', elevated: '#311654',
    text: '#F3F8FF', muted: '#C7B8E3', subtle: '#9A88BC',
    accent: '#E9A2EC', accentText: '#2A0950', accentInk: '#2A0950', titleAccent: '#E26EE5', danger: '#FF8A8A', dangerText: '#2A0950', dangerSoft: 'rgba(255,138,138,0.12)',
    border: '#2A1347', borderStrong: '#3B1D60', line3: '#6B4D93',
    lime: '#E26EE5', blue: '#C69BFF', paleBlue: '#E9C6FA', ice: '#311654', softLime: 'rgba(226,110,229,0.1)',
    navBackground: 'rgba(28,11,48,0.94)', navActiveBackground: '#E26EE5', navActiveText: '#2A0950', navActiveIcon: '#2A0950', softLimeText: '#E26EE5',
    chartTrack: 'rgba(255,255,255,0.08)', surfaceWarm: 'rgba(226,110,229,0.1)',
    q1: '#E26EE5', q2: '#C69BFF', q3: '#E9C6FA', qTrack: 'rgba(255,255,255,0.08)', qCore: 'rgba(255,255,255,0.03)',
    c8: '#1C0B30', c8Line: 'rgba(243,248,255,0.06)', soft1: 'rgba(198,155,255,0.12)', soft2: 'rgba(226,110,229,0.1)', chipBg: 'rgba(226,110,229,0.14)', chipFg: '#F3B6F5',
    g1: '#E26EE5', g2: '#B04FE4', plInk: '#2A0950', plGlow: 'rgba(226,110,229,0.38)',
    hsRim: '#311654', hsTrack: '#261041', hsDot: '#6B4D93', hsIb: '#311654', hsIc: '#E26EE5',
    pattern: '#E26EE5', patternOpacity: 0.06,
    mc1: 'rgba(198,155,255,0.14)', mb1: '#C69BFF', mc2: 'rgba(226,110,229,0.12)', mb2: '#E26EE5', mc3: 'rgba(233,198,250,0.1)', mb3: '#E9C6FA', mbt: 'rgba(255,255,255,0.1)',
    lv1: 'rgba(198,155,255,0.45)', lv2: '#C69BFF', lv3: '#E26EE5', lgi: 'rgba(255,255,255,0.03)',
    pgBar: '#C69BFF', pgHl: '#E26EE5', pgSoft: 'rgba(198,155,255,0.1)', pgUp: '#E26EE5',
    heroCard: '#49108B', navShadow: '#000000',
    candy: candyDark, candyInk: '#2A0950', candyGlow: 'rgba(226,110,229,0.36)',
    hero, heroShadow: '#E26EE5',
    chipStops: [{ offset: 0, color: '#E26EE5', opacity: 0.14 }, { offset: 1, color: '#E26EE5', opacity: 0.14 }], chipInk: '#F3B6F5',
    orbFrom: '#33175A', orbTo: '#1C0B30', orbRing: '#E26EE5', orbIcon: '#F3B6F5',
    cardShadow: '#000000',
    glowA: 'rgba(226,110,229,0.20)', glowB: 'rgba(126,48,225,0.26)',
    chartFill: '#C69BFF',
    sun: '#E26EE5', coral: '#C69BFF', lilac: '#311654', mint: '#C69BFF', sky: '#261041', ink: '#F3F8FF',
  },
  // Deep is not offered in the appearance picker; it is kept so stored values stay valid.
  // Values are the Volt Deep palette passed through the prototype's Lotus colour remap.
  deep: {
    light: false,
    bg: '#130B23', card: '#211638', card2: '#2C1E49', elevated: '#3A295E',
    text: '#F1EBFC', muted: '#B8AFD1', subtle: '#988BBD',
    accent: '#B98AF0', accentText: '#2A0950', accentInk: '#2A0950', titleAccent: '#E26EE5', danger: '#FF8A8A', dangerText: '#2A0950', dangerSoft: 'rgba(255,138,138,0.12)',
    border: '#2C1E4A', borderStrong: '#412D67', line3: '#624D8D',
    lime: '#E26EE5', blue: '#B98AF0', paleBlue: '#E6D6FA', ice: '#2C1E49', softLime: 'rgba(226,110,229,0.12)',
    navBackground: 'rgba(33,22,56,0.92)', navActiveBackground: '#E26EE5', navActiveText: '#2A0950', navActiveIcon: '#2A0950', softLimeText: '#E26EE5',
    chartTrack: 'rgba(255,255,255,0.1)', surfaceWarm: 'rgba(226,110,229,0.12)',
    q1: '#E26EE5', q2: '#B98AF0', q3: '#E6D6FA', qTrack: 'rgba(255,255,255,0.08)', qCore: 'rgba(255,255,255,0.03)',
    c8: '#211638', c8Line: 'rgba(255,255,255,0.06)', soft1: 'rgba(185,138,240,0.12)', soft2: 'rgba(226,110,229,0.1)', chipBg: 'rgba(226,110,229,0.14)', chipFg: '#E26EE5',
    g1: '#E26EE5', g2: '#B98AF0', plInk: '#2A0950', plGlow: 'rgba(226,110,229,0.25)',
    hsRim: '#3A295E', hsTrack: '#2C1E49', hsDot: '#624D8D', hsIb: '#3A295E', hsIc: '#E26EE5',
    pattern: '#B98AF0', patternOpacity: 0.075,
    mc1: 'rgba(185,138,240,0.14)', mb1: '#B98AF0', mc2: 'rgba(226,110,229,0.12)', mb2: '#E26EE5', mc3: 'rgba(230,214,250,0.1)', mb3: '#E6D6FA', mbt: 'rgba(255,255,255,0.1)',
    lv1: 'rgba(185,138,240,0.45)', lv2: '#B98AF0', lv3: '#E26EE5', lgi: 'rgba(255,255,255,0.03)',
    pgBar: '#B98AF0', pgHl: '#E26EE5', pgSoft: 'rgba(185,138,240,0.1)', pgUp: '#E26EE5',
    heroCard: '#7E30E1', navShadow: '#000000',
    candy: candyDark, candyInk: '#2A0950', candyGlow: 'rgba(226,110,229,0.36)',
    hero, heroShadow: '#E26EE5',
    chipStops: [{ offset: 0, color: '#E26EE5', opacity: 0.14 }, { offset: 1, color: '#E26EE5', opacity: 0.14 }], chipInk: '#F3B6F5',
    orbFrom: '#33175A', orbTo: '#211638', orbRing: '#E26EE5', orbIcon: '#F3B6F5',
    cardShadow: '#000000',
    glowA: 'rgba(226,110,229,0.20)', glowB: 'rgba(126,48,225,0.26)',
    chartFill: '#B98AF0',
    sun: '#E26EE5', coral: '#B98AF0', lilac: '#2C1E49', mint: '#B98AF0', sky: '#2C1E49', ink: '#F1EBFC',
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
  // Lotus `.card8`: 0 1px 2px rgba(73,16,139,.04), 0 12px 30px -14px rgba(73,16,139,.16).
  card: { shadowColor: '#49108B', shadowOpacity: 0.12, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  // Lotus `.tabs`: 0 12px 32px rgba(42,9,80,.14) + lavender under-glow.
  dock: { shadowColor: '#2A0950', shadowOpacity: 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
} as const;
export const fonts = { display: 'FitDisplay', displayHeavy: 'FitDisplayHeavy', body: 'FitBody', medium: 'FitBodyMedium', semibold: 'FitBodySemiBold', bold: 'FitBodyBold', mono: 'FitBodySemiBold', arabic: 'FitArabic', arabicBold: 'FitArabicBold' } as const;
