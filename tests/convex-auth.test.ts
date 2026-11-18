/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';
import { PRIVACY_VERSION, TERMS_VERSION } from '../shared/legalVersions';

const modules = import.meta.glob('../convex/**/*.{ts,js}');
const weight = { clientId: 'entry-1', day: '2026-11-04', kg: 80, note: '', createdAt: '2026-11-04T00:00:00.000Z' };

describe('Convex ownership', () => {
  it('rejects private reads and writes without a verified identity', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.profile.current, {})).rejects.toThrow('Authentication required');
    await expect(t.query(api.identity.current, {})).rejects.toThrow('Authentication required');
    await expect(t.mutation(api.weights.save, weight)).rejects.toThrow('Authentication required');
  });

  it('isolates records by verified identity even when client IDs match', async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: 'user_A', issuer: 'https://clerk.example' });
    const bob = t.withIdentity({ subject: 'user_B', issuer: 'https://clerk.example' });
    const agreement = { birthDate: '1990-05-10', timeZone: 'Africa/Casablanca', termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, agreed: true };
    await expect(alice.mutation(api.weights.save, weight)).rejects.toThrow('Adult eligibility');
    await alice.mutation(api.eligibility.accept, agreement);
    await bob.mutation(api.eligibility.accept, agreement);
    expect(await alice.query(api.eligibility.current, {})).toMatchObject({ adult: true, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION });
    await alice.mutation(api.weights.save, weight);
    expect((await alice.query(api.weights.history, {}))).toHaveLength(1);
    expect(await bob.query(api.weights.history, {})).toEqual([]);
    await bob.mutation(api.weights.remove, { clientId: weight.clientId });
    expect((await alice.query(api.weights.history, {}))).toHaveLength(1);
    await bob.mutation(api.weights.save, { ...weight, kg: 75 });
    expect((await alice.query(api.weights.history, {}))[0].kg).toBe(80);
    expect((await bob.query(api.weights.history, {}))[0].kg).toBe(75);
    expect((await alice.query(api.identity.current, {})).subject).toBe('user_A');
  });
  it('rejects underage, invalid and unagreed attempts on the server', async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: 'user_C', issuer: 'https://clerk.example' });
    const base = { birthDate: '1990-05-10', timeZone: 'UTC', termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, agreed: true };
    await expect(user.mutation(api.eligibility.accept, { ...base, agreed: false })).rejects.toThrow('Terms acceptance');
    await expect(user.mutation(api.eligibility.accept, { ...base, termsVersion: 'old' })).rejects.toThrow('Terms acceptance');
    await expect(user.mutation(api.eligibility.accept, { ...base, birthDate: '2020-01-01' })).rejects.toThrow('18 and older');
    await expect(user.mutation(api.eligibility.accept, { ...base, birthDate: '2000-02-30' })).rejects.toThrow('Invalid birth date');
    await expect(user.mutation(api.eligibility.accept, { ...base, timeZone: 'Invalid/Zone' })).rejects.toThrow('Invalid time zone');
    await user.mutation(api.eligibility.reject, {});
    expect(await user.query(api.eligibility.current, {})).toMatchObject({ rejected: true, adult: false });
    await expect(user.mutation(api.eligibility.accept, base)).rejects.toThrow('not eligible');
    await expect(user.mutation(api.weights.save, weight)).rejects.toThrow('Adult eligibility');
  });
});
