import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { clientId as validateClientId, day, finite, requireOwner, text, timestamp } from './security';

export const list = query({ args: {}, handler: async ctx => {
  const user = await requireOwner(ctx);
  return ctx.db.query('habits').withIndex('by_owner', q => q.eq('owner', user)).collect();
} });

export const save = mutation({ args: { clientId: v.string(), name: v.string(), description: v.string(), category: v.string(), icon: v.string(), frequency: v.union(v.literal('daily'), v.literal('days'), v.literal('quota')), days: v.array(v.number()), weeklyTarget: v.number(), startDate: v.string(), archived: v.boolean(), reminderTime: v.optional(v.string()), createdAt: v.string() }, handler: async (ctx, args) => {
  const user = await requireOwner(ctx);
  validateClientId(args.clientId); text(args.name, 'habit name', 120, true);
  text(args.description, 'description', 2000); text(args.category, 'category', 80, true);
  text(args.icon, 'icon', 32); finite(args.weeklyTarget, 'weekly target', 1, 7, true);
  if (args.days.length > 7 || new Set(args.days).size !== args.days.length) throw new Error('Invalid weekdays');
  if (args.frequency === 'days' && args.days.length === 0) throw new Error('Invalid weekdays');
  for (const weekday of args.days) finite(weekday, 'weekday', 0, 6, true);
  day(args.startDate, 'start date'); timestamp(args.createdAt, 'creation timestamp');
  if (args.reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(args.reminderTime)) throw new Error('Invalid reminder time');
  const existing = await ctx.db.query('habits').withIndex('by_owner_client', q => q.eq('owner', user).eq('clientId', args.clientId)).unique();
  const data = { ...args, owner: user, updatedAt: Date.now() };
  if (existing) { await ctx.db.patch(existing._id, data); return existing._id; }
  return ctx.db.insert('habits', data);
} });

export const setCompletion = mutation({ args: { habitClientId: v.string(), day: v.string(), completed: v.boolean() }, handler: async (ctx, args) => {
  const user = await requireOwner(ctx);
  validateClientId(args.habitClientId); day(args.day);
  const habit = await ctx.db.query('habits').withIndex('by_owner_client', q => q.eq('owner', user).eq('clientId', args.habitClientId)).unique();
  if (!habit) throw new Error('Habit not found');
  const clientId = `${args.habitClientId}:${args.day}`;
  const existing = await ctx.db.query('habitCompletions').withIndex('by_owner_client', q => q.eq('owner', user).eq('clientId', clientId)).unique();
  if (args.completed && !existing) await ctx.db.insert('habitCompletions', { owner: user, clientId, habitClientId: args.habitClientId, day: args.day, createdAt: new Date().toISOString(), updatedAt: Date.now() });
  if (!args.completed && existing) await ctx.db.delete(existing._id);
} });

export const completions = query({ args: { habitClientId: v.string() }, handler: async (ctx, { habitClientId }) => {
  const user = await requireOwner(ctx);
  validateClientId(habitClientId);
  return ctx.db.query('habitCompletions').withIndex('by_owner_habit', q => q.eq('owner', user).eq('habitClientId', habitClientId)).collect();
} });
