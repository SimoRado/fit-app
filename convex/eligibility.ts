import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { adultOnDay } from '../shared/ageEligibility';
import { PRIVACY_VERSION, TERMS_VERSION } from '../shared/legalVersions';
import { day, dayInZone, requireAuthenticatedOwner } from './security';

export const current = query({ args: {}, handler: async ctx => {
  const owner = await requireAuthenticatedOwner(ctx);
  const rejected = await ctx.db.query('ageRejections').withIndex('by_owner', q => q.eq('owner', owner)).first();
  const record = await ctx.db.query('eligibility').withIndex('by_owner', q => q.eq('owner', owner)).first();
  return { rejected: Boolean(rejected), acceptedAt: record?.acceptedAt ?? null, termsVersion: record?.termsVersion ?? null, privacyVersion: record?.privacyVersion ?? null, adult: record ? adultOnDay(record.birthDate, dayInZone(record.timeZone)) : false };
} });

export const reject = mutation({ args: {}, handler: async ctx => {
  const owner = await requireAuthenticatedOwner(ctx);
  const accepted = await ctx.db.query('eligibility').withIndex('by_owner', q => q.eq('owner', owner)).first();
  if (accepted) return;
  const prior = await ctx.db.query('ageRejections').withIndex('by_owner', q => q.eq('owner', owner)).first();
  if (!prior) await ctx.db.insert('ageRejections', { owner, rejectedAt: Date.now() });
} });

export const accept = mutation({ args: { birthDate: v.string(), timeZone: v.string(), termsVersion: v.string(), privacyVersion: v.string(), agreed: v.boolean() }, handler: async (ctx, args) => {
  const owner = await requireAuthenticatedOwner(ctx);
  if (await ctx.db.query('ageRejections').withIndex('by_owner', q => q.eq('owner', owner)).first()) throw new Error('Account is not eligible; contact privacy@cubyfit.app');
  if (!args.agreed || args.termsVersion !== TERMS_VERSION || args.privacyVersion !== PRIVACY_VERSION) throw new Error('Current Terms acceptance required');
  day(args.birthDate, 'birth date');
  if (args.timeZone.length > 100) throw new Error('Invalid time zone');
  let today: string;
  try { today = dayInZone(args.timeZone); } catch { throw new Error('Invalid time zone'); }
  if (!adultOnDay(args.birthDate, today)) throw new Error('Cubyfit is for adults aged 18 and older');
  const existing = await ctx.db.query('eligibility').withIndex('by_owner', q => q.eq('owner', owner)).first();
  if (existing && existing.birthDate !== args.birthDate) throw new Error('Contact privacy@cubyfit.app to correct your birth date');
  const data = { owner, birthDate: args.birthDate, timeZone: args.timeZone, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, acceptedAt: Date.now() };
  if (existing) await ctx.db.patch(existing._id, data);
  else await ctx.db.insert('eligibility', data);
  return { acceptedAt: data.acceptedAt, termsVersion: data.termsVersion };
} });
