import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getAppearancePalette, colors, parseAppearance, setAppearancePalette } from '../src/ui/theme';
import { primaryTabRoutes, secondaryTabRoutes } from '../src/core/voltNavigation';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

afterEach(() => setAppearancePalette('shore'));

describe('Volt appearance foundation', () => {
  it('uses the Lotus Shore values from the final prototype (html.x-f.t-shore)', () => {
    const shore = getAppearancePalette('shore');
    expect(shore.light).toBe(true);
    expect(shore.bg).toBe('#F3F8FF');
    expect(shore.card).toBe('#FFFFFF');
    expect(shore.card2).toBe('#F1EBFC');
    expect(shore.elevated).toBe('#E8DCF8');
    expect(shore.text).toBe('#2A0950');
    expect(shore.muted).toBe('#5B5075');
    expect(shore.accent).toBe('#7E30E1');
    expect(shore.titleAccent).toBe('#7E30E1');
    expect(shore.blue).toBe('#B98AF0');
    expect(shore.lime).toBe('#E26EE5');
  });

  it('uses the Lotus Abyss values and dark ink on orchid surfaces', () => {
    const abyss = getAppearancePalette('abyss');
    expect(abyss.light).toBe(false);
    expect(abyss.bg).toBe('#12061F');
    expect(abyss.card).toBe('#1C0B30');
    expect(abyss.card2).toBe('#261041');
    expect(abyss.elevated).toBe('#311654');
    expect(abyss.text).toBe('#F3F8FF');
    expect(abyss.muted).toBe('#C7B8E3');
    expect(abyss.accent).toBe('#E9A2EC');
    expect(abyss.titleAccent).toBe('#E26EE5');
    expect(abyss.accentInk).toBe('#2A0950');
    expect(abyss.lime).toBe('#E26EE5');
    expect(abyss.navActiveIcon).toBe('#2A0950');
    expect(abyss.candyInk).toBe('#2A0950');
  });

  it('replaces the current palette object when the selected appearance changes', () => {
    const original = colors;
    setAppearancePalette('abyss');
    expect(colors).not.toBe(original);
    expect(colors.bg).toBe('#12061F');
    setAppearancePalette('shore');
    expect(colors.bg).toBe('#F3F8FF');
  });

  it('parses saved appearance values and safely defaults unknown values to Shore', () => {
    expect(parseAppearance('abyss')).toBe('abyss');
    expect(parseAppearance('deep')).toBe('deep');
    expect(parseAppearance(undefined)).toBe('shore');
    expect(parseAppearance('unknown')).toBe('shore');
  });

  it('loads and saves appearance through the existing SQLite preferences repository', () => {
    const appState = source('src/state/app.tsx');
    expect(appState).toContain('repo.preferences()');
    expect(appState).toContain("item.key === 'appearance'");
    expect(appState).toContain("repo.setPreference('appearance', next)");
  });

  it('has one root theme owner across Clerk authentication and restores the saved selection', () => {
    const root = source('src/app/_layout.tsx');
    const appState = source('src/state/app.tsx');
    const provider = source('src/ui/VoltThemeProvider.tsx');
    expect(root).toContain('<VoltThemeProvider>');
    expect(root).toContain('<ClerkProvider');
    expect(root).not.toContain('resetAppearance()');
    expect(appState).toContain('const { appearance, setAppearance: applyAppearance } = useVoltTheme()');
    expect(appState).toContain('applyAppearance(savedAppearance)');
    expect(appState).not.toContain('useState<Appearance>');
    expect(provider).toContain('<RouterThemeProvider value={routerTheme}>');
    expect(provider).toContain('<StatusBar animated');
  });

  it('uses the provider palette for tab navigation and the reveal mask', () => {
    const tabs = source('src/app/(tabs)/_layout.tsx');
    const reveal = source('src/ui/PageReveal.tsx');
    expect(tabs).toContain('const { palette } = useVoltTheme()');
    expect(tabs).toContain('backgroundColor: palette.navBackground');
    expect(reveal).toContain('fill={palette.card}');
    expect(reveal).not.toContain('fill="#fff"');
  });

  it('keeps every primary tab subscribed to the authenticated appearance state', () => {
    for (const route of ['index', 'workouts', 'nutrition', 'habits', 'progress']) {
      const screen = source(`src/app/(tabs)/${route}.tsx`);
      expect(screen).toContain('useApp()');
      expect(screen).not.toMatch(/#(?:FBF7EF|6B4DF5|8B5CF6|F97316|FFEDD5|FAF5FF)\b/i);
    }
  });
});

describe('Volt primary navigation', () => {
  it('keeps Home, Train, Nutrition, Habits, and Progress in the reference order', () => {
    expect(primaryTabRoutes).toEqual(['index', 'workouts', 'nutrition', 'habits', 'progress']);
    expect(secondaryTabRoutes).toEqual(['profile']);
  });

  it('keeps secondary destinations registered and reachable from the existing app routes', () => {
    const layout = source('src/app/_layout.tsx');
    const home = source('src/app/(tabs)/index.tsx');
    const profile = source('src/app/(tabs)/profile.tsx');
    for (const route of ['habit-history', 'workout-form', 'routine-form', 'weight', 'missions', 'motivation', 'account']) {
      expect(layout).toContain(`name="${route}"`);
    }
    expect(home).toContain("router.push('/missions')");
    expect(home).toContain("router.push('/weight')");
    expect(home).toContain("router.push('/motivation')");
    expect(profile).toContain("router.push('/delete-account')");
    expect(source('src/ui/ProfileSheets.tsx')).toContain("router.push('/account')");
  });
});
