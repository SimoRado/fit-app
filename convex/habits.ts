import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

async function owner(ctx: { auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Authentication required');
  return identity.tokenIdentifier;
}

export const list = query({ args: {}, handler: async ctx => {
  const user = await owner(ctx);
  return ctx.db.query('habits').withIndex('by_owner', q => q.eq('owner', user)).collect();
} });

export const save = mutation({ args: { clientId: v.string(), name: v.string(), description: v.string(), category: v.string(), icon: v.string(), frequency: v.union(v.literal('daily'), v.literal('days'), v.literal('quota')), days: v.array(v.number()), weeklyTarget: v.number(), startDate: v.string(), archived: v.boolean(), reminderTime: v.optional(v.string()), createdAt: v.string() }, handler: async (ctx, args) => {
  const user = await owner(ctx);
  const existing = await ctx.db.query('habits').withIndex('by_owner_client', q => q.eq('owner', user).eq('clientId', args.clientId)).unique();
  const data = { ...args, owner: user, updatedAt: Date.now() };
  if (existing) { await ctx.db.patch(existing._id, data); return existing._id; }
  return ctx.db.insert('habits', data);
} });

export const setCompletion = mutation({ args: { habitClientId: v.string(), day: v.string(), completed: v.boolean() }, handler: async (ctx, args) => {
  const user = await owner(ctx);
  const habit = await ctx.db.query('habits').withIndex('by_owner_client', q => q.eq('owner', user).eq('clientId', args.habitClientId)).unique();
  if (!habit) throw new Error('Habit not found');
  const clientId = `${args.habitClientId}:${args.day}`;
  const existing = await ctx.db.query('habitCompletions').withIndex('by_owner_client', q => q.eq('owner', user).eq('clientId', clientId)).unique();
  if (args.completed && !existing) await ctx.db.insert('habitCompletions', { owner: user, clientId, habitClientId: args.habitClientId, day: args.day, createdAt: new Date().toISOString(), updatedAt: Date.now() });
  if (!args.completed && existing) await ctx.db.delete(existing._id);
} });

export const completions = query({ args: { habitClientId: v.string() }, handler: async (ctx, { habitClientId }) => {
  const user = await owner(ctx);
  return ctx.db.query('habitCompletions').withIndex('by_owner_habit', q => q.eq('owner', user).eq('habitClientId', habitClientId)).collect();
} });
