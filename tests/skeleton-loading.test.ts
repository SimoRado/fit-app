import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { personalRecords } from '../src/core/logic';
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../src/core/types';
import { exerciseSeeds, migrations } from '../src/data/schema';
import { routineExerciseListQuery, workoutExerciseListQuery } from '../src/data/queries';
import { loadTransition, type LoadStatus } from '../src/state/useLoadState';
import { getAppearancePalette, type Appearance, type Style } from '../src/ui/theme';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const tabs = ['index', 'workouts', 'nutrition', 'habits', 'progress'] as const;

describe('first-load state machine', () => {
  it('leaves the skeleton on success and never returns to it on later reads', () => {
    let status: LoadStatus = 'loading';
    status = loadTransition(status, 'success').status;
    expect(status).toBe('ready');
    expect(loadTransition(status, 'success').status).toBe('ready');
  });

  it('turns a failed first read into an error state with a retry (no endless skeleton)', () => {
    const failed = loadTransition('loading', 'failure');
    expect(failed).toEqual({ status: 'error', firstLoadFailure: true });
    expect(loadTransition(failed.status, 'retry').status).toBe('loading');
    expect(loadTransition('loading', 'success').status).toBe('ready');
  });

  it('keeps cached content visible when a refresh fails after the first load', () => {
    expect(loadTransition('ready', 'failure')).toEqual({ status: 'ready', firstLoadFailure: false });
  });
});

describe('screen loading states', () => {
  it('gives every primary tab a first-load state, an error/retry state and a layout skeleton', () => {
    for (const tab of tabs) {
      const screen = source(`src/app/(tabs)/${tab}.tsx`);
      expect(screen, tab).toMatch(/useLoadState\(('\w+')?\)/);
      expect(screen, tab).toContain('<LoadError');
      expect(screen, tab).toContain('<SkeletonScreen');
      // Reload effects re-run on retry and ignore results from superseded reads.
      expect(screen, tab).toMatch(/if \((active|current) && !(fail|dataFailed|nutritionFailed|historyFailed)\(\)\) message\(error\)/);
    }
    expect(source('src/app/(tabs)/nutrition.tsx')).not.toContain('Loading nutrition…');
  });

  it('shows empty states and counts only after the first read has completed', () => {
    const train = source('src/app/(tabs)/workouts.tsx');
    expect(train).toContain("eyebrow={loaded ? `${stats.week} session");
    expect(train).toContain("{load.status === 'loading' && <TrainSkeleton");
    expect(train).toContain('{loaded && <>');
    const home = source('src/app/(tabs)/index.tsx');
    expect(home).toContain("{homeStatus === 'ready' && <>");
    const habits = source('src/app/(tabs)/habits.tsx');
    expect(habits).toContain('if (!loaded) return <Page');
    const progress = source('src/app/(tabs)/progress.tsx');
    expect(progress).toContain("if (status !== 'ready') return <Page");
  });

  it('only shows Home nutrition for the selected day', () => {
    const home = source('src/app/(tabs)/index.tsx');
    expect(home).toContain('setNutrition({ day: selectedDay');
    expect(home).toContain('const dayNutrition = nutrition?.day === selectedDay ? nutrition : null;');
    expect(home).not.toContain('nutrition!.');
  });

  it('adds first-load skeletons to data-dependent secondary screens', () => {
    for (const path of ['src/app/weight.tsx', 'src/app/habit-history.tsx']) {
      const screen = source(path);
      expect(screen, path).toMatch(/useLoadState\(('\w+')?\)/);
      expect(screen, path).toContain('<SkeletonScreen');
      expect(screen, path).toContain('<LoadError');
    }
  });

  it('keeps per-screen caches account scoped by remounting the authenticated tree per account', () => {
    const root = source('src/app/_layout.tsx');
    expect(root).toContain('<LocalAccount key={userId}');
    expect(root).toContain('<AppProvider key={userId}>');
    // No new module-level cache of fitness data was introduced for skeletons.
    expect(source('src/state/useLoadState.ts')).not.toMatch(/^(const|let) \w+ = new Map/m);
  });
});

describe('skeleton primitives', () => {
  const skeleton = source('src/ui/Skeleton.tsx');
  it('runs one delayed, reduced-motion aware pulse per skeleton group and stops it on unmount', () => {
    expect(skeleton.match(/useSharedValue\(/g)).toHaveLength(1);
    expect(skeleton).toContain('withDelay(PULSE_DELAY_MS');
    expect(skeleton).toContain('if (reduced)');
    expect(skeleton).toContain('cancelAnimation(opacity)');
  });
  it('announces loading once and hides placeholder shapes from assistive technology', () => {
    expect(skeleton).toContain("accessibilityRole: 'progressbar' as const");
    expect(skeleton).toContain('accessibilityState: { busy: true }');
    expect(skeleton).toContain('importantForAccessibility="no-hide-descendants"');
    expect(skeleton).not.toContain('Pressable');
  });
});

describe('tab transition', () => {
  it('no longer renders tab pages through a software MaskedView', () => {
    const reveal = source('src/ui/PageReveal.tsx');
    expect(reveal).not.toContain('@react-native-masked-view');
    expect(reveal).not.toContain('<NativeMaskedView');
    expect(reveal).not.toContain("'software'");
    expect(reveal).toContain('PAGE_REVEAL_MS = 200');
    expect(reveal).toContain('START_OPACITY = 0.45');
  });
  it('preloads the other tabs one at a time only after Home shows real content', () => {
    const home = source('src/app/(tabs)/index.tsx');
    expect(home).toContain("if (homeStatus !== 'ready' || preloadStarted.current) return;");
    expect(home).toContain("const TAB_PRELOAD_ORDER = ['/(tabs)/workouts', '/(tabs)/nutrition', '/(tabs)/habits', '/(tabs)/progress'] as const;");
    expect(home).toContain('router.prefetch(href)');
    expect(home).toContain('return () => { if (timer) clearTimeout(timer); };');
  });
  it('lets a preloaded tab identify itself by its own route, not the path at mount', () => {
    const page = source('src/ui/components.tsx');
    expect(page).toContain('const route = useRoute();');
    expect(page).toContain('const tabName = ownTab ? route.name :');
  });
  it('keeps tab timing markers development-only', () => {
    const perf = source('src/core/perf.ts');
    expect(perf).toContain('export function markTabPress(route: string) { if (isDev())');
    expect(perf).toMatch(/export function markTabPhase[\s\S]*?if \(!isDev\(\)/);
  });
  it('updates the tab motion context once per tap', () => {
    const motion = source('src/ui/motion.ts');
    expect(motion).not.toContain('activeRoute:');
    expect(motion).not.toContain('setActiveRoute');
    expect(motion).toContain('useMemo(() => ({ transition, reveal })');
    expect(source('src/app/(tabs)/_layout.tsx')).not.toContain('setActiveRoute');
  });
});

describe('theme tokens for skeletons and Home shortcuts', () => {
  const combos: [Style, Appearance][] = [['volt', 'shore'], ['volt', 'abyss'], ['volt', 'deep'], ['lotus', 'shore'], ['lotus', 'abyss'], ['lotus', 'deep']];
  const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const luminance = (hex: string) => { const [r, g, b] = rgb(hex).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

  it('gives every style × appearance a soft skeleton surface that is visible but low contrast', () => {
    for (const [style, appearance] of combos) {
      const p = getAppearancePalette(appearance, style);
      expect(p.skeleton, `${style}/${appearance}`).toMatch(/^#[0-9A-F]{6}$/i);
      for (const surface of [p.bg, p.card]) {
        const ratio = contrast(p.skeleton, surface);
        expect(ratio, `${style}/${appearance} on ${surface}`).toBeGreaterThan(1.05);
        expect(ratio, `${style}/${appearance} on ${surface}`).toBeLessThan(1.6);
      }
      // Never a bright accent (volt lime, orchid, violet) as a large placeholder block.
      expect(['#DFFF1F', '#E26EE5', '#7E30E1', '#B04FE4']).not.toContain(p.skeleton.toUpperCase());
    }
  });

  it('keeps the Lotus shortcut orb exactly as before', () => {
    const light = getAppearancePalette('shore', 'lotus');
    expect([light.orbFrom, light.orbTo, light.orbRing, light.orbIcon, light.orbGlow]).toEqual(['#FFFFFF', '#F1E6FD', '#E26EE5', '#7E30E1', '0px 8px 18px -10px rgba(126,48,225,0.5)']);
    for (const appearance of ['abyss', 'deep'] as const) {
      const dark = getAppearancePalette(appearance, 'lotus');
      expect([dark.orbRing, dark.orbIcon, dark.orbGlow]).toEqual(['#E26EE5', '#F3B6F5', '0px 0px 16px -4px rgba(226,110,229,0.45)']);
    }
  });

  it('gives Volt the same ringed orb in its own navy / sky palette', () => {
    for (const appearance of ['shore', 'abyss', 'deep'] as const) {
      const p = getAppearancePalette(appearance, 'volt');
      expect(p.orbRing).not.toBe('transparent');
      for (const value of [p.orbFrom, p.orbTo, p.orbRing, p.orbIcon, p.orbGlow]) expect(value.toUpperCase()).not.toMatch(/E26EE5|7E30E1|F3B6F5|F1E6FD|126,48,225|226,110,229/);
    }
    expect(getAppearancePalette('shore', 'volt').orbIcon).toBe('#1D2E8F');
  });

  it('uses one shared shortcut layout with theme-driven colours and unchanged routes', () => {
    const home = source('src/app/(tabs)/index.tsx');
    const shortcut = home.slice(home.indexOf('function Shortcut('), home.indexOf('/** `.nx`'));
    expect(shortcut).not.toContain("p.style === 'volt'");
    expect(shortcut).not.toContain('rgba(126,48,225');
    expect(shortcut).toContain('width: 54, height: 54, borderRadius: 27');
    expect(shortcut).toContain('boxShadow: `inset 0px 0px 0px 1.5px ${p.orbRing}, ${p.orbGlow}`');
    for (const [title, route] of [['Nutrition', 'nutrition'], ['Train', 'workouts'], ['Habits', 'habits'], ['Progress', 'progress']]) {
      expect(home).toContain(`title="${title}" onPress={() => router.push('/(tabs)/${route}')}`);
    }
  });
});

describe('narrower exercise reads', () => {
  function seeded() {
    const sql = new DatabaseSync(':memory:');
    sql.exec('PRAGMA foreign_keys=ON');
    migrations.forEach(migration => sql.exec(migration));
    for (const [id, name] of exerciseSeeds) sql.prepare('INSERT INTO exercises VALUES (?,?,?,0)').run(id, name, 'weight_reps');
    sql.prepare('INSERT INTO exercises VALUES (?,?,?,1)').run('mine', 'A custom move', 'reps');
    sql.prepare('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('owner', 'Alex', '1990-01-01', 175, 80, null, 'Beginner', 'Fitness', '', 'en', 'now');
    return sql;
  }
  const full = (sql: DatabaseSync) => sql.prepare('SELECT * FROM exercises ORDER BY custom, name').all() as unknown as Exercise[];

  it('returns exactly the routine exercises, in the full list order', () => {
    const sql = seeded();
    const ids = [exerciseSeeds[2][0], 'mine', exerciseSeeds[0][0]];
    sql.prepare('INSERT INTO routines VALUES (?,?,?,?)').run('r', 'owner', 'Push', 'now');
    ids.forEach((id, index) => sql.prepare('INSERT INTO routine_exercises VALUES (?,?,?,?)').run(`l${index}`, 'r', id, index));
    const rows = sql.prepare(routineExerciseListQuery).all() as unknown as Exercise[];
    expect(rows).toEqual(full(sql).filter(row => ids.includes(row.id)));
  });

  it('returns exactly the logged exercises, so personal records are unchanged', () => {
    const sql = seeded();
    sql.prepare('INSERT INTO workouts (id, owner_id, name, day, started_at, duration_min, notes, completed, created_at) VALUES (?,?,?,?,?,?,?,?,?)').run('w', 'owner', 'Gym', '2026-11-02', 'now', 30, '', 1, 'now');
    const ids = [exerciseSeeds[1][0], exerciseSeeds[3][0]];
    ids.forEach((id, index) => sql.prepare('INSERT INTO workout_exercises VALUES (?,?,?,?)').run(`we${index}`, 'w', id, index));
    const rows = sql.prepare(workoutExerciseListQuery).all() as unknown as Exercise[];
    expect(rows).toEqual(full(sql).filter(row => ids.includes(row.id)));
  });
});

describe('personal records', () => {
  /** The previous implementation (exercises × links × sets), kept as the reference. */
  function reference(exercises: Exercise[], links: WorkoutExercise[], sets: WorkoutSet[], workouts: Workout[]) {
    const completedIds = new Set(workouts.filter(workout => workout.completed).map(workout => workout.id));
    return exercises.map(exercise => {
      const linkIds = new Set(links.filter(link => link.exercise_id === exercise.id && completedIds.has(link.workout_id)).map(link => link.id));
      const relevant = sets.filter(set => set.completed && linkIds.has(set.workout_exercise_id));
      if (exercise.metric === 'duration') return { name: exercise.name, metric: exercise.metric, value: Math.max(0, ...relevant.map(set => set.duration_sec ?? 0)), reps: null };
      if (exercise.metric === 'reps') return { name: exercise.name, metric: exercise.metric, value: Math.max(0, ...relevant.map(set => set.reps ?? 0)), reps: null };
      const best = relevant.slice().sort((a, b) => (b.weight_kg ?? 0) - (a.weight_kg ?? 0) || (b.reps ?? 0) - (a.reps ?? 0))[0];
      return { name: exercise.name, metric: exercise.metric, value: best?.weight_kg ?? 0, reps: best?.reps ?? null };
    }).filter(record => record.value > 0 || (record.metric === 'weight_reps' && (record.reps ?? 0) > 0));
  }

  it('matches the previous implementation on randomized histories', () => {
    let seed = 7;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const metrics = ['weight_reps', 'reps', 'duration'] as const;
    for (let round = 0; round < 25; round++) {
      const exercises: Exercise[] = Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, name: `Exercise ${i}`, metric: metrics[i % 3], custom: i % 7 === 0 ? 1 : 0 }));
      const workouts: Workout[] = Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, owner_id: 'p', name: 'Gym', day: '2026-11-02', started_at: '', duration_min: 30, notes: '', completed: random() < 0.75 ? 1 : 0, created_at: '' }));
      const links: WorkoutExercise[] = Array.from({ length: 60 }, (_, i) => ({ id: `l${i}`, workout_id: `w${Math.floor(random() * 12)}`, exercise_id: `e${Math.floor(random() * 40)}`, position: i }));
      const sets: WorkoutSet[] = Array.from({ length: 240 }, (_, i) => ({ id: `s${i}`, workout_exercise_id: `l${Math.floor(random() * 64)}`, set_number: i, reps: random() < 0.2 ? null : Math.floor(random() * 15), weight_kg: random() < 0.3 ? null : Math.floor(random() * 120), duration_sec: random() < 0.3 ? null : Math.floor(random() * 90), note: '', completed: random() < 0.8 ? 1 : 0 }));
      expect(personalRecords(exercises, links, sets, workouts)).toEqual(reference(exercises, links, sets, workouts));
    }
  });
});

describe('Personalization sheet responsiveness', () => {
  it('drops only the pending choices that the app state has caught up with', async () => {
    const { settlePending } = await import('../src/core/personalizationPending');
    const applied = { sex: 'male' as const, styleMode: 'volt' as const, appearance: 'abyss' as const };
    const pending = { styleMode: 'volt' as const, appearance: 'shore' as const };
    expect(settlePending(pending, applied)).toEqual({ appearance: 'shore' });
    expect(settlePending({ appearance: 'abyss' }, { ...applied, appearance: 'deep' })).toEqual({});
    const unchanged = { styleMode: 'lotus' as const };
    expect(settlePending(unchanged, applied)).toBe(unchanged);
  });

  it('shows the tapped option at once and applies the recolour as a transition', () => {
    const sheet = source('src/ui/PersonalizationSheet.tsx');
    expect(sheet).toContain('setPending(current => ({ ...current, [key]: value }));');
    expect(sheet).toContain('startTransition(() => {');
    expect(sheet).toContain("selected={shownMode === option.mode}");
    // A failed save drops the optimistic choice before reporting the error.
    expect(sheet).toMatch(/apply\(\)\.catch\(error => \{\s*setPending\([\s\S]*?message\(error\);/);
  });
});
