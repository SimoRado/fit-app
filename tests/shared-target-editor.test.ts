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
  it('opens the existing paywall and only mentions a trial the store returned', () => {
    const profile = source('src/app/(tabs)/profile.tsx');
    expect(profile).toContain("router.push('/paywall')");
    expect(profile).toContain("proTrial ? 'Start free' : 'See plans'");
    expect(profile).not.toMatch(/7 days free|7-day/);
  });
});
