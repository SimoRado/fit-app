import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAppearancePalette } from '../src/ui/theme';
import { HORSESHOE, dailyProgressPercent, horseshoeArc, horseshoeBadge, horseshoeLength, ringFraction, roundedRectLength, squareRing } from '../src/core/voltGeometry';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Volt prototype tokens', () => {
  it('uses the final Shore values for rings, pills, gauge and macro chips', () => {
    const shore = getAppearancePalette('shore');
    expect([shore.q1, shore.q2, shore.q3]).toEqual(['#1D2E8F', '#9CCBFF', '#DFFF1F']);
    expect(shore.qTrack).toBe('#EEF6FF');
    expect([shore.g1, shore.g2, shore.plInk]).toEqual(['#1D2E8F', '#0B1446', '#FFFFFF']);
    expect([shore.c8, shore.c8Line, shore.soft1, shore.soft2]).toEqual(['#FFFFFF', '#E4EEFB', '#EEF6FF', '#F6FFC2']);
    expect([shore.hsRim, shore.hsTrack, shore.hsIb, shore.hsIc]).toEqual(['#C9E3FF', '#FFFFFF', '#DFFF1F', '#1D2E8F']);
    expect([shore.mc1, shore.mc2, shore.mc3]).toEqual(['#EEF6FF', '#F6FFC2', '#E3F1FF']);
    expect(shore.navActiveBackground).toBe('#1D2E8F');
    expect(shore.navActiveIcon).toBe('#DFFF1F');
  });

  it('uses the final Abyss values: lime anchors on true black with midnight surfaces', () => {
    const abyss = getAppearancePalette('abyss');
    expect(abyss.bg).toBe('#000000');
    expect([abyss.q1, abyss.q2, abyss.q3]).toEqual(['#DFFF1F', '#9CCBFF', '#C9E3FF']);
    expect([abyss.g1, abyss.g2, abyss.plInk]).toEqual(['#DFFF1F', '#9CCBFF', '#0B1446']);
    expect(abyss.c8).toBe('#0B0E1A');
    expect(abyss.navBackground).toBe('rgba(11,14,26,0.94)');
    expect(abyss.navActiveBackground).toBe('#DFFF1F');
    expect(abyss.heroCard).toBe('#1A2A80');
  });

  it('does not reintroduce colors from earlier prototype concepts', () => {
    for (const path of ['src/ui/theme.ts', 'src/ui/voltKit.tsx', 'src/app/(tabs)/index.tsx', 'src/app/(tabs)/nutrition.tsx', 'src/app/(tabs)/habits.tsx', 'src/app/(tabs)/workouts.tsx', 'src/app/(tabs)/progress.tsx', 'src/app/weight.tsx', 'src/app/missions.tsx', 'src/app/motivation.tsx']) {
      expect(source(path)).not.toMatch(/#(?:FBF7EF|6B4DF5|8B5CF6|F97316|FFEDD5|FAF5FF|2d333c|14171c)\b/i);
    }
  });
});

describe('Volt progress geometry', () => {
  it('matches the prototype nested rounded-square rings', () => {
    expect(squareRing(0)).toMatchObject({ offset: 5, width: 126, radius: 30 });
    expect(squareRing(1)).toMatchObject({ offset: 20, width: 96, radius: 23 });
    expect(squareRing(2)).toMatchObject({ offset: 35, width: 66, radius: 16 });
    expect(squareRing(0).length).toBeCloseTo(roundedRectLength(126, 30));
    expect(roundedRectLength(100, 0)).toBe(400);
  });

  it('always shows a 1% dot and never overflows a ring', () => {
    expect(ringFraction(0)).toBe(0.01);
    expect(ringFraction(2.4)).toBe(1);
    expect(ringFraction(Number.NaN)).toBe(0.01);
    expect(ringFraction(0.43)).toBe(0.43);
  });

  it('draws the 240° horseshoe gauge and places the badge along it', () => {
    expect(horseshoeArc()).toBe('M36.9 164.0A96 96 0 1 1 203.1 164.0');
    expect(horseshoeLength()).toBeCloseTo(96 * Math.PI * 4 / 3);
    const [startX, startY] = horseshoeBadge(0);
    const [endX, endY] = horseshoeBadge(5);
    expect([+startX.toFixed(1), +startY.toFixed(1)]).toEqual([36.9, 164]);
    expect([+endX.toFixed(1), +endY.toFixed(1)]).toEqual([203.1, 164]);
    const [midX, midY] = horseshoeBadge(0.5);
    expect(midX).toBeCloseTo(HORSESHOE.cx);
    expect(midY).toBeCloseTo(HORSESHOE.cy - HORSESHOE.radius);
  });

  it('averages the available daily rings like the prototype and ignores untracked ones', () => {
    expect(dailyProgressPercent([0.61, 4 / 6, 0])).toBe(43);
    expect(dailyProgressPercent([1.4, 1, null])).toBe(100);
    expect(dailyProgressPercent([null, null, null])).toBeNull();
  });
});

describe('Volt screens keep the existing engine and the agreed exceptions', () => {
  it('Habits is tap-only (no swipe or drag gestures) with visible controls for every action', () => {
    const habits = source('src/app/(tabs)/habits.tsx');
    expect(habits).not.toMatch(/PanResponder|Swipeable|GestureDetector|Gesture\.Pan|onTouchMove|onResponderMove|SwipeRow/);
    expect(habits).toContain('accessibilityLabel={`More actions for ${habit.name}`}');
    expect(habits).toMatch(/accessibilityRole=\{quantity \? 'button' : 'checkbox'\}/);
    expect(habits).toContain('repo.setHabitCompletion(id, today, completed)');
    // Measured habits step atomically in SQLite (read-add-write in one transaction).
    expect(habits).toContain('repo.addHabitAmount(habit.id, day, delta)');
    expect(habits).toContain("router.push({ pathname: '/habit-history', params: { id: menu.id } })");
    expect(habits).toContain('repo.moveHabit(id, direction)');
  });

  it('Home reads real repositories and keeps the account entry point', () => {
    const home = source('src/app/(tabs)/index.tsx');
    expect(home).toContain('repo.habits()');
    expect(home).toContain('nutritionTarget(selectedDay)');
    expect(home).toContain('repo.openWorkoutSession(profile.id)');
    expect(home).toContain('<SquareRings');
    expect(home).toContain('<FoodSheet');
    expect(home).not.toMatch(/Mohamed|1,411|2,300|12 day streak/);
  });

  it('Nutrition keeps the food sheet, targets and catalog preparation', () => {
    const nutrition = source('src/app/(tabs)/nutrition.tsx');
    expect(nutrition).toContain('<FoodSheet');
    expect(nutrition).toContain('<TargetsSheet');
    expect(nutrition).toContain('prepareFoodCatalog()');
    expect(nutrition).toContain('<Horseshoe');
  });

  it('Train keeps routine start, the in-progress session and rest days', () => {
    const train = source('src/app/(tabs)/workouts.tsx');
    expect(train).toContain("params: { routine: routine.id }");
    expect(train).toContain('<WorkoutInProgressCard');
    expect(train).toContain('repo.toggleRest(profile!.id, today)');
  });

  it('active workout keeps its timer, finish flow and interstitial hook', () => {
    const workout = source('src/app/workout-form.tsx');
    expect(workout).toContain('togglePause');
    expect(workout).toContain('finishLiveWorkout(close)');
    expect(workout).toContain('interstitialManager.afterWorkoutSaved(result.completedWorkoutId)');
  });

  it('respects reduced motion in the shared Volt animations', () => {
    const kit = source('src/ui/voltKit.tsx');
    expect(kit.match(/useReducedMotion\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });
});
