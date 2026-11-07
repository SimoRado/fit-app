import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { clientId, day, finite, requireOwner, text, timestamp } from './security';

export const current = query({ args: {}, handler: async ctx => {
  const user = await requireOwner(ctx);
  return ctx.db.query('profiles').withIndex('by_owner', q => q.eq('owner', user)).first();
} });

export const save = mutation({ args: {
  clientId: v.string(), name: v.string(), birthDate: v.string(), heightCm: v.number(), startWeight: v.number(), targetWeight: v.optional(v.number()), experience: v.string(), fitnessGoal: v.string(), growthGoals: v.string(), language: v.string(), completedAt: v.string(),
}, handler: async (ctx, args) => {
  const user = await requireOwner(ctx);
  clientId(args.clientId); text(args.name, 'name', 120, true); day(args.birthDate, 'birth date');
  const birth = new Date(`${args.birthDate}T00:00:00.000Z`);
  const now = new Date();
  const age = now.getUTCFullYear() - birth.getUTCFullYear() - (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate()) ? 1 : 0);
  if (birth >= now || age > 120) throw new Error('Invalid birth date');
  finite(args.heightCm, 'height', 50, 300); finite(args.startWeight, 'start weight', 1, 1000);
  if (args.targetWeight !== undefined) finite(args.targetWeight, 'target weight', 1, 1000);
  text(args.experience, 'experience', 40, true); text(args.fitnessGoal, 'fitness goal', 500, true);
  if (!['Beginner', 'Intermediate', 'Advanced'].includes(args.experience)) throw new Error('Invalid experience');
  text(args.growthGoals, 'growth goals', 1000); text(args.language, 'language', 10, true);
  if (!['en', 'fr', 'ar'].includes(args.language)) throw new Error('Invalid language');
  timestamp(args.completedAt, 'completion timestamp');
  const existing = await ctx.db.query('profiles').withIndex('by_owner', q => q.eq('owner', user)).first();
  if (existing && existing.clientId !== args.clientId) throw new Error('Profile already exists');
  const data = { ...args, owner: user, updatedAt: Date.now() };
  if (existing) { await ctx.db.patch(existing._id, data); return existing._id; }
  return ctx.db.insert('profiles', data);
} });
