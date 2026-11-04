import { describe, expect, it } from 'vitest';
import { localDatabaseName } from '../src/data/account';

describe('local account boundaries', () => {
  it('gives each Clerk user a separate database and leaves the guest file untouched', () => {
    const first = localDatabaseName('user_A123');
    const second = localDatabaseName('user_B456');
    expect(first).not.toBe(second);
    expect(first).not.toBe('better-day.db');
  });
  it('rejects a path or arbitrary client-provided identifier', () => {
    expect(() => localDatabaseName('../better-day')).toThrow();
    expect(() => localDatabaseName('user_A/../../B')).toThrow();
  });
});
