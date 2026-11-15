import { describe, expect, it } from 'vitest';
import { PRESS_IN_DURATION_MS, PRESS_OUT_DURATION_MS, TAB_SELECTION_DURATION_MS, pressTarget } from '../src/core/pressMotion';

describe('Volt press feedback', () => {
  it('keeps even older aggressive call sites within a subtle range', () => {
    expect(pressTarget(0.86, false, false)).toBe(0.97);
    expect(pressTarget(0.98, false, false)).toBe(0.98);
    expect(pressTarget(1.2, false, false)).toBe(0.98);
  });
  it('leaves disabled and reduced-motion buttons still', () => {
    expect(pressTarget(0.86, true, false)).toBe(1);
    expect(pressTarget(0.86, false, true)).toBe(1);
  });
  it('finishes feedback and tab selection promptly', () => {
    expect(PRESS_IN_DURATION_MS).toBeLessThanOrEqual(80);
    expect(PRESS_OUT_DURATION_MS).toBeLessThanOrEqual(120);
    expect(TAB_SELECTION_DURATION_MS).toBeLessThanOrEqual(200);
  });
});
