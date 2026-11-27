import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  runtime: 'development-client',
  channel: vi.fn(async () => ({ importance: 5 })),
  permissions: vi.fn(async () => ({ granted: true })),
  request: vi.fn(async () => ({ granted: true })),
  report: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 5, NONE: 2 }, IosAuthorizationStatus: { PROVISIONAL: 3 },
  setNotificationHandler: vi.fn(), setNotificationChannelAsync: state.channel,
  getPermissionsAsync: state.permissions, requestPermissionsAsync: state.request,
}));
vi.mock('../src/core/runtime', () => ({ runtimeSignals: () => ({ kind: state.runtime }) }));
vi.mock('../src/core/monitoring', () => ({ reportFailure: state.report }));
vi.mock('../src/data/db', () => ({ getLocalAccount: () => null, db: vi.fn(), repo: {} }));

import { requestReminderPermission } from '../src/services/reminders';

beforeEach(() => {
  state.runtime = 'development-client';
  state.channel.mockReset().mockResolvedValue({ importance: 5 });
  state.permissions.mockReset().mockResolvedValue({ granted: true });
  state.request.mockReset().mockResolvedValue({ granted: true });
  state.report.mockReset();
});

describe('Android reminder setup', () => {
  it('explains an Expo Go channel failure while allowing working local notifications', async () => {
    state.runtime = 'expo-go';
    expect(await requestReminderPermission()).toBe(true);
    state.channel.mockRejectedValueOnce(Error('java.lang.NullPointerException'));
    await expect(requestReminderPermission()).rejects.toThrow('Development build');
  });
  it('reports a native channel failure and does not request permission or claim success', async () => {
    state.channel.mockRejectedValue(Error('java.lang.NullPointerException'));
    await expect(requestReminderPermission()).rejects.toThrow('new APK');
    expect(state.report).toHaveBeenCalledWith('reminder-channel', expect.any(Error));
    expect(state.request).not.toHaveBeenCalled();
  });
  it('treats a disabled channel and denied OS permission as unavailable', async () => {
    state.channel.mockResolvedValueOnce({ importance: 2 });
    await expect(requestReminderPermission()).rejects.toThrow('disabled in Android settings');
    state.permissions.mockResolvedValueOnce({ granted: false });
    state.request.mockResolvedValueOnce({ granted: false });
    expect(await requestReminderPermission()).toBe(false);
  });
});
