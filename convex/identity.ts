import { query } from './_generated/server';

// A safe signed-in connectivity check. No fitness records are read or written.
export const current = query({ args: {}, handler: async ctx => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Authentication required');
  return { subject: identity.subject, issuer: identity.issuer };
} });
