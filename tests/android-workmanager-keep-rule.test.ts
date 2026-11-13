import { describe, expect, it } from 'vitest';

const {
  addWorkManagerRoomKeepRule,
} = require('../plugins/withAndroidWorkManagerRoomKeepRule');

describe('Android WorkManager Room keep rule', () => {
  it('preserves the generated Room database constructor without duplicating the rule', () => {
    const once = addWorkManagerRoomKeepRule('# Existing rules\n');
    const twice = addWorkManagerRoomKeepRule(once);

    expect(once).toContain('androidx.work.impl.WorkDatabase_Impl');
    expect(once).toContain('<init>();');
    expect(twice).toBe(once);
  });
});
