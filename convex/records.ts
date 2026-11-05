import { query } from './_generated/server';
import { v } from 'convex/values';
import { clientId as validateClientId, requireOwner } from './security';

const table = v.union(...(['profiles', 'habits', 'habitCompletions', 'missions', 'missionCompletions', 'exercises', 'routines', 'workouts', 'weights', 'measurements', 'restDays', 'favorites', 'preferences'] as const).map(v.literal));

export const list = query({ args: { table }, handler: async (ctx, { table }) => {
  const user = await requireOwner(ctx);
  return ctx.db.query(table).withIndex('by_owner', q => q.eq('owner', user)).collect();
} });

export const get = query({ args: { table, clientId: v.string() }, handler: async (ctx, { table, clientId }) => {
  const user = await requireOwner(ctx);
  validateClientId(clientId);
  return ctx.db.query(table).withIndex('by_owner_client', q => q.eq('owner', user).eq('clientId', clientId)).unique();
} });

// A constrained document API keeps the transport type-safe without accepting ownership from clients.
// Writes remain disabled until a consent-based local migration and sync flow exists.
