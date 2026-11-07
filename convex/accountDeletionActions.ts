'use node';

import { verifyToken } from '@clerk/backend';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action, internalAction } from './_generated/server';

export function recentFactor(value: unknown) {
  return Array.isArray(value) && value.some(age => typeof age === 'number' && age >= 0 && age < 10);
}
export const request = action({ args: { confirmation: v.string(), sessionToken: v.string(), receipt: v.string() }, handler: async (ctx, args): Promise<{ receipt: string; stage: string }> => {
  if (args.confirmation !== 'DELETE' || args.sessionToken.length > 8000 || !/^[0-9a-f-]{72}$/.test(args.receipt)) throw Error('Deletion confirmation required');
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw Error('Authentication required');
  const jwtKey = process.env.CLERK_JWT_KEY;
  const issuer = process.env.CLERK_FRONTEND_API_URL;
  if (!jwtKey || !issuer) throw Error('Deletion verification is not configured');
  const token = await verifyToken(args.sessionToken, { jwtKey });
  if (token.sub !== identity.subject || token.iss !== identity.issuer || token.iss !== issuer || !recentFactor((token as { fva?: unknown }).fva)) throw Error('Recent authentication required');
  return ctx.runMutation(internal.accountDeletion.begin, { owner: identity.tokenIdentifier, clerkUserId: identity.subject, receipt: args.receipt });
} });

type Customer = { id: string };
async function rcRequest(path: string, method: 'GET' | 'DELETE', key: string) {
  const response = await fetch(`https://api.revenuecat.com${path}`, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } });
  if (response.status === 429) throw Error('revenuecat_rate_limit');
  if (response.status === 401 || response.status === 403) throw Error('revenuecat_permissions');
  if (response.status >= 500) throw Error('revenuecat_unavailable');
  if (!response.ok && response.status !== 404) throw Error('revenuecat_request_failed');
  return response;
}
export async function deleteRevenueCatCustomer(clerkUserId: string) {
  const key = process.env.REVENUECAT_SECRET_KEY;
  const project = process.env.REVENUECAT_PROJECT_ID;
  if (!key || !project) throw Error('revenuecat_not_configured');
  const base = `/v2/projects/${encodeURIComponent(project)}/customers`;
  const search = await rcRequest(`${base}?search=${encodeURIComponent(clerkUserId)}&limit=100`, 'GET', key);
  if (search.status === 404) return;
  const results = await search.json() as { items?: Customer[]; next_page?: string | null };
  if (results.next_page) throw Error('revenuecat_ambiguous_customer');
  for (const customer of results.items ?? []) {
    if (!/^[A-Za-z0-9_-]{1,1500}$/.test(customer.id)) throw Error('revenuecat_ambiguous_customer');
    const path = `${base}/${encodeURIComponent(customer.id)}`;
    const aliasesResponse = await rcRequest(`${path}/aliases?limit=100`, 'GET', key);
    if (aliasesResponse.status === 404) continue;
    const aliases = await aliasesResponse.json() as { items?: { id: string }[]; next_page?: string | null };
    if (aliases.next_page) throw Error('revenuecat_ambiguous_customer');
    const identifiers = (aliases.items ?? []).map(item => item.id);
    if (!identifiers.includes(clerkUserId)) continue;
    if (identifiers.some(id => id !== clerkUserId && !id.startsWith('$RCAnonymousID:'))) throw Error('revenuecat_shared_customer');
    const deletion = await rcRequest(path, 'DELETE', key);
    if (deletion.status === 404) continue;
    const verification = await rcRequest(path, 'GET', key);
    if (verification.status !== 404) throw Error('revenuecat_deletion_pending');
  }
}
export async function deleteClerkUser(clerkUserId: string) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw Error('clerk_not_configured');
  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${secret}` } });
  if (response.status === 404) return;
  if (response.status === 429) throw Error('clerk_rate_limit');
  if (response.status === 401 || response.status === 403) throw Error('clerk_permissions');
  if (!response.ok) throw Error('clerk_unavailable');
}
export const processJob = internalAction({ args: { jobId: v.id('deletionJobs') }, handler: async (ctx, { jobId }) => {
  const job = await ctx.runQuery(internal.accountDeletion.job, { jobId });
  if (!job || job.stage === 'completed' || job.stage === 'retry_required') return;
  try {
    if (job.stage === 'cloud_pending') {
      await ctx.runMutation(internal.accountDeletion.cleanBatch, { jobId });
      await ctx.scheduler.runAfter(0, internal.accountDeletionActions.processJob, { jobId });
    } else if (job.stage === 'revenuecat_pending') {
      await deleteRevenueCatCustomer(job.clerkUserId);
      await ctx.runMutation(internal.accountDeletion.advance, { jobId, from: 'revenuecat_pending', to: 'clerk_pending' });
      await ctx.scheduler.runAfter(0, internal.accountDeletionActions.processJob, { jobId });
    } else if (job.stage === 'clerk_pending') {
      await deleteClerkUser(job.clerkUserId);
      await ctx.runMutation(internal.accountDeletion.complete, { jobId });
    }
  } catch (cause) {
    const known = new Set(['revenuecat_rate_limit', 'revenuecat_permissions', 'revenuecat_unavailable', 'revenuecat_request_failed', 'revenuecat_not_configured', 'revenuecat_ambiguous_customer', 'revenuecat_shared_customer', 'revenuecat_deletion_pending', 'clerk_not_configured', 'clerk_rate_limit', 'clerk_permissions', 'clerk_unavailable']);
    const category = cause instanceof Error && known.has(cause.message) ? cause.message : 'deletion_unavailable';
    await ctx.runMutation(internal.accountDeletion.fail, { jobId, retryStage: job.stage, errorCategory: category });
  }
} });
