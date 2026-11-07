import { describe, expect, it, vi } from 'vitest';
import { activateGoogleSession, clerkGateState } from '../src/core/googleSession';

describe('Google session and Clerk navigation gate', () => {
  it('activates only the session Clerk returned', async () => {
    const setActive = vi.fn(async () => undefined);
    expect(await activateGoogleSession({ createdSessionId: 'session-from-clerk', setActive })).toBe(true);
    expect(setActive).toHaveBeenCalledExactlyOnceWith({ session: 'session-from-clerk' });
  });
  it('does not activate when Clerk did not create a session', async () => {
    const setActive = vi.fn(async () => undefined);
    expect(await activateGoogleSession({ createdSessionId: null, setActive })).toBe(false);
    expect(setActive).not.toHaveBeenCalled();
  });
  it('propagates activation failures instead of navigating as signed in', async () => {
    await expect(activateGoogleSession({ createdSessionId: 'session-from-clerk', setActive: async () => { throw new Error('activation failed'); } })).rejects.toThrow('activation failed');
  });
  it('keeps protected navigation loading until Clerk is ready with an account', () => {
    expect(clerkGateState(false, true, 'user_a')).toBe('loading');
    expect(clerkGateState(true, true, null)).toBe('signed-out');
    expect(clerkGateState(true, true, 'user_a')).toBe('signed-in');
    expect(clerkGateState(true, false, 'user_a')).toBe('signed-out');
  });
});
