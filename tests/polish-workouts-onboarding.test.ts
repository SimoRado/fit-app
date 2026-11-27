import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { startingPointComplete, startingPointIssue } from '../src/core/onboardingProfile';
import { resolveStyle } from '../src/ui/theme';
import { validateProfileValues } from '../src/core/validation';

const read = (path: string) => readFileSync(path, 'utf8');
const base = { sex: 'female' as const, height: '170', weight: '70', target: '65' };

describe('onboarding starting point', () => {
  it('requires a sex choice (never preselected) and a target weight', () => {
    expect(startingPointIssue({ ...base, sex: null })).toBe('Select Male or Female.');
    expect(startingPointIssue({ ...base, target: '' })).toBe('Enter your target weight.');
    expect(startingPointIssue({ ...base, target: '   ' })).toBe('Enter your target weight.');
    expect(startingPointComplete({ ...base, sex: null })).toBe(false);
    expect(startingPointComplete({ ...base, target: '' })).toBe(false);
    expect(startingPointIssue(base)).toBeNull();
    expect(read('src/app/onboarding.tsx')).toContain('useState<Sex | null>(null)');
  });
  it('rejects zero, negative, non-numeric and out-of-range targets', () => {
    for (const target of ['0', '-5', 'abc', '19', '501']) expect(startingPointIssue({ ...base, target })).toBe('Target weight must be 20–500 kg.');
    expect(startingPointIssue({ ...base, target: '20' })).toBeNull();
    expect(startingPointIssue({ ...base, height: '' })).toBe('Enter a valid height.');
    expect(startingPointIssue({ ...base, weight: '0' })).toBe('Enter a valid current weight.');
  });
  it('keeps existing profiles without a target valid', () => {
    expect(validateProfileValues({ name: 'A', birth_date: '1990-01-01', height_cm: 170, start_weight: 70, target_weight: null }, '2026-11-27').target_weight).toBeNull();
  });
  it('labels the field as required and blocks Continue until complete', () => {
    const onboarding = read('src/app/onboarding.tsx');
    expect(onboarding).toContain('<Field label="Target weight (kg)"');
    expect(onboarding).not.toContain('Target weight (kg, optional)');
    expect(onboarding).toContain('busy || ageBlocked || startingBlocked');
    expect(onboarding).toContain('await repo.setPreference(prefKeys.sex, sex);');
  });
});

describe('theme independence from sex', () => {
  it('removes "Match my profile" and the Sex selector from Appearance', () => {
    const sheet = read('src/ui/PersonalizationSheet.tsx');
    expect(sheet).not.toContain('Match my profile');
    expect(sheet).not.toContain('title="Sex"');
  });
  it('never changes colours when sex changes, and freezes legacy profile mode to its current look', () => {
    const app = read('src/state/app.tsx');
    expect(app).toContain('applySex(next);\n    try { await repo.setPreference(prefKeys.sex, next); }');
    expect(app).toContain('const explicitStyle = resolveStyle(parseStyleMode(storedMode), savedSex);');
    expect(resolveStyle('profile', 'female')).toBe('lotus');
    expect(resolveStyle('volt', 'female')).toBe('volt');
    expect(resolveStyle('lotus', 'male')).toBe('lotus');
  });
  it('saves an explicit style for new profiles so sex cannot select one later', () => {
    expect(read('src/app/onboarding.tsx')).toContain('await repo.setPreference(STYLE_MODE_KEY, style);');
  });
});

describe('workouts and loading polish', () => {
  const workouts = read('src/app/(tabs)/workouts.tsx');
  it('replaces Empty workout with Create routine opening the existing editor', () => {
    expect(workouts).not.toContain('title="Empty workout"');
    expect(workouts).toContain(`<Button title="Create routine" onPress={() => router.push('/routine-form')}/>`);
    expect(workouts).toContain("todayPlan?.kind === 'rest' ? 'Undo rest day' : 'Rest day'");
  });
  it('uses the soft theme surface for the Rest Day banner and the done Habits icon', () => {
    expect(workouts).toContain("borderRadius: 22, backgroundColor: p.soft1 }}>\n      <IconBox icon=\"moon-outline\" size={42} radius={14} color={p.text}/>");
    expect(read('src/app/(tabs)/index.tsx')).toContain('background={done ? (p.light ? p.paleBlue : p.soft1)');
  });
  it('spaces the selected tab label from its icon', () => {
    expect(read('src/app/(tabs)/_layout.tsx')).toContain('marginStart: interpolate(progress.value, [0, 1], [0, 7])');
  });
  it('opens the exercise picker at a stable height in both editors', () => {
    expect(read('src/app/routine-form.tsx')).toContain('<BottomSheet stableHeight="88%"');
    expect(read('src/app/workout-form.tsx')).toContain('<BottomSheet stableHeight="88%"');
    expect(read('src/ui/BottomSheet.tsx')).toContain('stableHeight ? { height: stableHeight }');
  });
  it('shows row skeletons instead of spinners while catalogs load', () => {
    expect(read('src/ui/ExerciseBrowser.tsx')).toContain('<ExerciseResultsSkeleton/>');
    expect(read('src/ui/NutritionSheets.tsx')).toContain(': searchPending ? <FoodResultsSkeleton/>');
  });
  it('uses platform pushes for screens and a light rise for forms', () => {
    expect(read('src/ui/motion.ts')).toContain("animation: reduced ? 'none' as const : 'default' as const");
    expect(read('src/app/_layout.tsx')).toContain('<Stack.Screen name="routine-form" options={formAnimation}/>');
  });
});
