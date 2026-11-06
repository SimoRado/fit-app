import { describe, expect, it } from 'vitest';
import { elapsedWorkoutSeconds, finishWorkoutTimer, formatWorkoutElapsed, pauseWorkoutTimer, resumeWorkoutTimer, startWorkoutTimer, workoutTimerFromRecord } from '../src/core/workoutTimer';

describe('persisted workout timer', () => {
  it('starts from a controllable timestamp and formats under and over an hour', () => {
    const running = startWorkoutTimer(1_000_000);
    expect(elapsedWorkoutSeconds(running, 1_043_000)).toBe(43);
    expect(formatWorkoutElapsed(43 * 60 + 28)).toBe('43:28');
    expect(formatWorkoutElapsed(72 * 60 + 45)).toBe('01:12:45');
  });

  it('excludes a ten minute pause from the final active duration', () => {
    const started = startWorkoutTimer(1_000_000);
    const paused = pauseWorkoutTimer(started, 1_000_000 + 20 * 60_000);
    expect(paused.elapsed_seconds).toBe(20 * 60);
    const resumed = resumeWorkoutTimer(paused, 1_000_000 + 30 * 60_000);
    const finished = finishWorkoutTimer(resumed, 1_000_000 + 45 * 60_000);
    expect(finished.elapsed_seconds).toBe(35 * 60);
    expect(finished.paused_seconds).toBe(10 * 60);
    expect(elapsedWorkoutSeconds(finished, 1_000_000 + 90 * 60_000)).toBe(35 * 60);
  });

  it('does not count the current paused interval when finishing', () => {
    const started = startWorkoutTimer(10_000);
    const paused = pauseWorkoutTimer(started, 10_000 + 20 * 60_000);
    const finished = finishWorkoutTimer(paused, 10_000 + 30 * 60_000);
    expect(finished.elapsed_seconds).toBe(20 * 60);
    expect(finished.paused_seconds).toBe(10 * 60);
    expect(finished.finished_at_ms).toBe(10_000 + 30 * 60_000);
  });

  it('continues through backgrounding, screen lock, and app restart because no pause transition occurs', () => {
    const persisted = startWorkoutTimer(50_000);
    const restored = JSON.parse(JSON.stringify(persisted));
    expect(elapsedWorkoutSeconds(restored, 50_000 + 17 * 60_000)).toBe(17 * 60);
    expect(workoutTimerFromRecord({ id: 'w', owner_id: 'p', name: 'Gym', day: '2026-11-06', started_at: '', duration_min: null, notes: '', completed: 0, created_at: '', ...restored }).session_status).toBe('running');
  });

  it('restores an explicitly paused session without resuming it', () => {
    const paused = pauseWorkoutTimer(startWorkoutTimer(100), 600_100);
    const restored = JSON.parse(JSON.stringify(paused));
    expect(restored.session_status).toBe('paused');
    expect(elapsedWorkoutSeconds(restored, 9_000_000)).toBe(600);
  });

  it('ignores duplicate pause and resume events', () => {
    const started = startWorkoutTimer(0);
    const paused = pauseWorkoutTimer(started, 20_000);
    expect(pauseWorkoutTimer(paused, 40_000)).toEqual(paused);
    const resumed = resumeWorkoutTimer(paused, 50_000);
    expect(resumeWorkoutTimer(resumed, 90_000)).toEqual(resumed);
    expect(resumed.elapsed_seconds).toBe(20);
    expect(resumed.paused_seconds).toBe(30);
  });

  it('clamps invalid or backwards timestamps so duration never becomes negative', () => {
    const started = startWorkoutTimer(50_000);
    expect(elapsedWorkoutSeconds(started, 1)).toBe(0);
    expect(elapsedWorkoutSeconds({ ...started, elapsed_seconds: -200 }, 50_000)).toBe(0);
    expect(elapsedWorkoutSeconds({ ...started, running_since_ms: Number.NaN }, 100_000)).toBe(0);
    expect(formatWorkoutElapsed(-1)).toBe('00:00');
  });
});
