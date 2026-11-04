import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

async function owner(ctx: { auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Authentication required');
  return identity.tokenIdentifier;
}

export const history = query({ args: {}, handler: async ctx => {
  const user = await owner(ctx);
  return ctx.db.query('weights').withIndex('by_owner_day', q => q.eq('owner', user)).order('desc').collect();
} });

export const save = mutation({ args: { clientId: v.string(), day: v.string(), kg: v.number(), note: v.string(), createdAt: v.string() }, handler: async (ctx, args) => {
  const user = await owner(ctx);
  if (!Number.isFinite(args.kg) || args.kg <= 0) throw new Error('Invalid weight');
  const existing = await ctx.db.query('weights').withIndex('by_owner', q => q.eq('owner', user)).filter(q => q.eq(q.field('clientId'), args.clientId)).unique();
  const data = { ...args, owner: user, updatedAt: Date.now() };
  if (existing) { await ctx.db.patch(existing._id, data); return existing._id; }
  return ctx.db.insert('weights', data);
} });

export const remove = mutation({ args: { clientId: v.string() }, handler: async (ctx, { clientId }) => {
  const user = await owner(ctx);
  const existing = await ctx.db.query('weights').withIndex('by_owner', q => q.eq('owner', user)).filter(q => q.eq(q.field('clientId'), clientId)).unique();
  if (existing) await ctx.db.delete(existing._id);
} });
