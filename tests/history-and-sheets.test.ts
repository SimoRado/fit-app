import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { historyAccess, monthWeeks } from '../src/core/habitHistory';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('History calendar layout', () => {
  it('can start weeks on Sunday (reference) without changing the Monday default', () => {
    // 1 Nov 2026 is a Sunday: first cell of a Sunday-first grid, last cell of a Monday-first one.
    expect(monthWeeks('2026-11', 0)[0][0]).toBe('2026-11-01');
    expect(monthWeeks('2026-11', 0)).toHaveLength(5);
    expect(monthWeeks('2026-11')[0][6]).toBe('2026-11-01');
    expect(monthWeeks('2026-11', 0).flat().filter(Boolean)).toHaveLength(30);
  });
  it('offers a working Week view that reuses the same access rules', () => {
    const sheet = source('src/ui/HabitHistorySheet.tsx');
    expect(sheet).toContain("const TABS: Tab[] = ['week', 'month', 'year']");
    expect(sheet).toContain('function WeekView(');
    expect(sheet).toContain("if (delta < 0 && !access.canBrowseMonth(monthKey(addDays(next, 6)))) { setLocked('months'); return; }");
    expect(sheet).toContain('isLocked={day => !access.canBrowseMonth(monthKey(day))}');
  });
  it('Free sees the current month only while Pro additionally gets earlier months and the year', () => {
    const free = historyAccess(false, '2026-11-18'), pro = historyAccess(true, '2026-11-18');
    expect([free.canBrowseMonth('2026-11'), free.canBrowseMonth('2026-10'), free.canOpenYear]).toEqual([true, false, false]);
    expect([pro.canBrowseMonth('2026-10'), pro.canOpenYear]).toEqual([true, true]);
    expect(free.canBrowseMonth('2026-12')).toBe(false);
  });
  it('derives the intensity scale from the active palette (Volt blue, Lotus violet)', () => {
    const calendar = source('src/ui/HistoryCalendar.tsx');
    expect(calendar).toContain('fill: light ? [p.chartTrack, p.paleBlue, p.blue, p.accent]');
  });
});

describe('Bottom sheets keep the drag handle fixed', () => {
  const sheet = source('src/ui/BottomSheet.tsx');
  it('renders the handle/title header outside every ScrollView', () => {
    const headerAt = sheet.indexOf('{header}');
    const scrollAt = sheet.indexOf('<ScrollView');
    expect(headerAt).toBeGreaterThan(-1);
    expect(scrollAt).toBeGreaterThan(headerAt);
    // The header element itself contains no scroll view.
    const header = sheet.slice(sheet.indexOf('const header ='), sheet.indexOf('return <Modal'));
    expect(header).not.toContain('ScrollView');
    expect(header).toContain('{...pan.panHandlers}');
  });
  it('drag-to-dismiss is limited to the header so content scrolling still works', () => {
    expect(sheet).toContain('onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx)');
    expect(sheet).toContain('g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY');
  });
});

describe('Personalization', () => {
  const sheet = source('src/ui/PersonalizationSheet.tsx');
  it('offers the three style choices and two appearances', () => {
    for (const text of ['Match my profile', "'Navy, sky and volt'", "'Indigo, violet and orchid'", 'Also used for calorie estimates', 'Light or dark']) expect(sheet).toContain(text);
  });
  it('does not promise the postponed body map', () => {
    expect(sheet.toLowerCase()).not.toContain('body map');
  });
  it('uses the existing sex preference rather than a new field', () => {
    expect(sheet).toContain('setSex(value)');
    expect(source('src/state/app.tsx')).toContain('repo.setPreference(prefKeys.sex, next)');
  });
});
