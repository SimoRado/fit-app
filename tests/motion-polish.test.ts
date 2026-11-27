import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MOTION, PRESS_IN_DURATION_MS, PRESS_OUT_DURATION_MS } from '../src/core/pressMotion';

const read = (path: string) => readFileSync(path, 'utf8');

describe('shared motion timings', () => {
  it('stay inside the agreed ranges', () => {
    expect(MOTION.sheetOpen).toBeGreaterThanOrEqual(250); expect(MOTION.sheetOpen).toBeLessThanOrEqual(350);
    expect(MOTION.sheetClose).toBeGreaterThanOrEqual(180); expect(MOTION.sheetClose).toBeLessThanOrEqual(280);
    expect(MOTION.segment).toBeGreaterThanOrEqual(180); expect(MOTION.segment).toBeLessThanOrEqual(250);
    expect(MOTION.toggle).toBeGreaterThanOrEqual(140); expect(MOTION.toggle).toBeLessThanOrEqual(220);
    expect(PRESS_IN_DURATION_MS).toBeLessThan(PRESS_OUT_DURATION_MS);
  });
});

describe('bottom sheet lifecycle', () => {
  const sheet = read('src/ui/BottomSheet.tsx');
  it('keeps the Modal mounted until the exit animation ends, then unmounts it', () => {
    expect(sheet).toContain('const [mounted, setMounted] = useState(visible);');
    expect(sheet).toContain('if (!mounted && !visible) return null;');
    expect(sheet).toContain('<Modal visible transparent animationType="none"');
    // Closed from outside: same exit animation, unmount only if still hidden.
    expect(sheet).toContain('if (!visibleRef.current) { setMounted(false); setClosing(false); }');
  });
  it('uses the shared timings and still supports drag, Android Back and reduced motion', () => {
    expect(sheet).toContain('duration: MOTION.sheetOpen');
    expect(sheet).toContain('duration: MOTION.sheetClose');
    expect(sheet).toContain('onRequestClose={() => close()}');
    expect(sheet).toContain('sheetShouldDismiss(g.dy, g.vy)');
    expect(sheet).toContain('if (reduced) { finish(); return; }');
  });
  it('re-opens if a dismissal guard keeps the sheet visible', () => {
    expect(sheet).toContain('if (!closeRequest || !visible || !lowered.current) return;');
  });
});

describe('press feedback', () => {
  it('adds a UI-thread opacity dip to plain pressables without changing their behaviour', () => {
    const motion = read('src/ui/MotionPressable.tsx');
    expect(motion).toContain('export function TapPressable');
    expect(motion).toContain("if (typeof style === 'function') return <Pressable");
    for (const file of ['src/app/(tabs)/habits.tsx', 'src/ui/HistoryCalendar.tsx', 'src/ui/NutritionSheets.tsx', 'src/ui/BottomSheet.tsx']) {
      expect(read(file)).toContain('TapPressable as Pressable');
    }
  });
  it('leaves account deletion UI untouched', () => {
    expect(read('src/ui/DeletionProgress.tsx')).not.toContain('TapPressable');
  });
});

describe('navigation and selectors', () => {
  it('uses one native stack animation that respects reduced motion', () => {
    expect(read('src/ui/motion.ts')).toContain("animation: reduced ? 'none' as const : 'default' as const");
    expect(read('src/app/_layout.tsx').match(/\.\.\.stackAnimation/g)?.length).toBe(2);
    expect(read('src/app/(auth)/_layout.tsx')).toContain('...stackAnimation');
    expect(read('src/app/_layout.tsx')).toContain("options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}");
  });
  it('slides the auth and workout scope pills with the shared segment thumb', () => {
    expect(read('src/ui/auth.tsx')).toContain('useSegmentThumb(');
    expect(read('src/app/(tabs)/workouts.tsx')).toContain('useSegmentThumb(');
    expect(read('src/ui/segmentMotion.ts')).toContain('duration: MOTION.segment');
  });
});
