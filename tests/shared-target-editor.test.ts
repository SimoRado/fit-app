import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');

describe('one nutrition target editor', () => {
  it('is shared by Profile, Nutrition settings and first-run setup', () => {
    const profile = source('src/ui/ProfileSheets.tsx');
    const nutrition = source('src/ui/NutritionSheets.tsx');
    expect(profile).toContain('<NutritionTargetEditor');
    expect(nutrition.match(/<NutritionTargetEditor/g)).toHaveLength(2);
    expect(nutrition).not.toContain('function TargetFields');
    expect(nutrition).toContain("label={item => item === 'remaining' ? 'Calories left' : 'Calories eaten'}");
    expect(nutrition).toContain('Saved custom foods');
  });
  it('saves edits as custom targets from today with the ±50 / ±5 steps', () => {
    const editor = source('src/ui/NutritionTargetEditor.tsx');
    expect(editor).toContain('saveCustomTargets(values)');
    expect(editor).toContain('stepTarget(key');
  });
});

describe('Profile Pro banner', () => {
  it('opens the existing paywall from the Pro card and never invents prices or trials', () => {
    const profile = source('src/app/(tabs)/profile.tsx');
    const card = source('src/ui/ProMembershipCard.tsx');
    expect(profile).toContain("<ProMembershipCard signal={subscription} onOpen={() => router.push('/paywall')}/>");
    // The card sits between the four stat cards and the settings list.
    expect(profile.indexOf('<StatCard label="Habits"')).toBeLessThan(profile.indexOf('<ProMembershipCard'));
    expect(profile.indexOf('<ProMembershipCard')).toBeLessThan(profile.indexOf('rows.map('));
    for (const text of [profile, card]) {
      expect(text).not.toMatch(/7 days free|7-day|\$\d|€\d|\d+[.,]\d\d\s?(USD|EUR|MAD)/);
      expect(text).not.toMatch(/isPremium\s*[:=]\s*true/);
    }
    expect(card).toContain('proStatus(signal)');
    expect(card).toContain("'Explore Pro'");
  });
});
