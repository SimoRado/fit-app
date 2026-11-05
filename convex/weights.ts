import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { clientId, day, finite, requireOwner, text, timestamp } from './security';

export const history = query({ args: {}, handler: async ctx => {
  const user = await requireOwner(ctx);
  return ctx.db.query('weights').withIndex('by_owner_day', q => q.eq('owner', user)).order('desc').collect();
} });

export const save = mutation({ args: { clientId: v.string(), day: v.string(), kg: v.number(), note: v.string(), createdAt: v.string() }, handler: async (ctx, args) => {
  const user = await requireOwner(ctx);
  clientId(args.clientId); day(args.day); finite(args.kg, 'weight', 1, 1000);
  text(args.note, 'note', 2000); timestamp(args.createdAt, 'creation timestamp');
  const existing = await ctx.db.query('weights').withIndex('by_owner_client', q => q.eq('owner', user).eq('clientId', args.clientId)).unique();
  const data = { ...args, owner: user, updatedAt: Date.now() };
  if (existing) { await ctx.db.patch(existing._id, data); return existing._id; }
  return ctx.db.insert('weights', data);
} });

export const remove = mutation({ args: { clientId: v.string() }, handler: async (ctx, { clientId }) => {
  const user = await requireOwner(ctx);
  if (clientId.length > 128 || !clientId.trim()) throw new Error('Invalid client ID');
  const existing = await ctx.db.query('weights').withIndex('by_owner_client', q => q.eq('owner', user).eq('clientId', clientId)).unique();
  if (existing) await ctx.db.delete(existing._id);
} });
