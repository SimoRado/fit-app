import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

async function owner(ctx: { auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Authentication required');
  return identity.tokenIdentifier;
}

export const current = query({ args: {}, handler: async ctx => {
  const user = await owner(ctx);
  return ctx.db.query('profiles').withIndex('by_owner', q => q.eq('owner', user)).first();
} });

export const save = mutation({ args: {
  clientId: v.string(), name: v.string(), birthDate: v.string(), heightCm: v.number(), startWeight: v.number(), targetWeight: v.optional(v.number()), experience: v.string(), fitnessGoal: v.string(), growthGoals: v.string(), language: v.string(), completedAt: v.string(),
}, handler: async (ctx, args) => {
  const user = await owner(ctx);
  const existing = await ctx.db.query('profiles').withIndex('by_owner', q => q.eq('owner', user)).filter(q => q.eq(q.field('clientId'), args.clientId)).unique();
  const data = { ...args, owner: user, updatedAt: Date.now() };
  if (existing) { await ctx.db.patch(existing._id, data); return existing._id; }
  return ctx.db.insert('profiles', data);
} });
