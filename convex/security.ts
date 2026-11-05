import type { MutationCtx, QueryCtx } from './_generated/server';

export async function requireOwner(ctx: Pick<QueryCtx | MutationCtx, 'auth'>): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Authentication required');
  return identity.tokenIdentifier;
}

export function text(value: string, field: string, max: number, required = false) {
  if ((required && !value.trim()) || value.length > max) throw new Error(`Invalid ${field}`);
}

export function finite(value: number, field: string, min: number, max: number, integer = false) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`Invalid ${field}`);
}

export function day(value: string, field = 'date') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid ${field}`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`Invalid ${field}`);
}

export function timestamp(value: string, field = 'timestamp') {
  if (value.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${field}`);
  day(value.slice(0, 10), field);
}

export function clientId(value: string) { text(value, 'client ID', 128, true); }
