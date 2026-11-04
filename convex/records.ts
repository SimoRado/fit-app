import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const table = v.union(...(['profiles', 'habits', 'habitCompletions', 'missions', 'missionCompletions', 'exercises', 'routines', 'workouts', 'weights', 'measurements', 'restDays', 'favorites', 'preferences'] as const).map(v.literal));

async function owner(ctx: { auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Authentication required');
  return identity.tokenIdentifier;
}

export const list = query({ args: { table }, handler: async (ctx, { table }) => {
  const user = await owner(ctx);
  return ctx.db.query(table).withIndex('by_owner', q => q.eq('owner', user)).collect();
} });

export const get = query({ args: { table, clientId: v.string() }, handler: async (ctx, { table, clientId }) => {
  const user = await owner(ctx);
  return ctx.db.query(table).withIndex('by_owner', q => q.eq('owner', user)).filter(q => q.eq(q.field('clientId'), clientId)).unique();
} });

// A constrained document API keeps the transport type-safe without accepting ownership from clients.
// Sync is intentionally disabled until an app authentication provider and migration flow exist.
