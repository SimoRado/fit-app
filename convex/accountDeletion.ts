import { internal } from './_generated/api';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { v } from 'convex/values';

const privateTables = ['profiles', 'habits', 'habitCompletions', 'missions', 'missionCompletions', 'exercises', 'routines', 'workouts', 'weights', 'measurements', 'restDays', 'favorites', 'preferences', 'syncRecords', 'syncOperations'] as const;
const stage = v.union(v.literal('cloud_pending'), v.literal('revenuecat_pending'), v.literal('clerk_pending'));

export const begin = internalMutation({ args: { owner: v.string(), clerkUserId: v.string(), receipt: v.string() }, handler: async (ctx, { owner, clerkUserId, receipt }) => {
  const existing = await ctx.db.query('deletionJobs').withIndex('by_owner', q => q.eq('owner', owner)).first();
  if (existing) {
    if (existing.clerkUserId !== clerkUserId) throw Error('Deletion target mismatch');
    return { receipt: existing.receipt, stage: existing.stage };
  }
  const now = Date.now();
  const id = await ctx.db.insert('deletionJobs', { owner, clerkUserId, receipt, stage: 'cloud_pending', attempts: 0, createdAt: now, updatedAt: now });
  await ctx.scheduler.runAfter(0, internal.accountDeletionActions.processJob, { jobId: id });
  return { receipt, stage: 'cloud_pending' as const };
} });

export const job = internalQuery({ args: { jobId: v.id('deletionJobs') }, handler: (ctx, { jobId }) => ctx.db.get(jobId) });
export const current = query({ args: {}, handler: async ctx => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw Error('Authentication required');
  const job = await ctx.db.query('deletionJobs').withIndex('by_owner', q => q.eq('owner', identity.tokenIdentifier)).first();
  return job ? { receipt: job.receipt, stage: job.stage } : null;
} });
export const status = query({ args: { receipt: v.string() }, handler: async (ctx, { receipt }) => {
  if (receipt.length < 60 || receipt.length > 100) return null;
  const job = await ctx.db.query('deletionJobs').withIndex('by_receipt', q => q.eq('receipt', receipt)).first();
  return job ? { stage: job.stage, errorCategory: job.errorCategory ?? null, completedAt: job.completedAt ?? null } : null;
} });
export const retry = mutation({ args: {}, handler: async ctx => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw Error('Authentication required');
  const job = await ctx.db.query('deletionJobs').withIndex('by_owner', q => q.eq('owner', identity.tokenIdentifier)).first();
  if (!job || job.stage !== 'retry_required') throw Error('No retry is required');
  await ctx.db.patch(job._id, { stage: job.retryStage ?? 'cloud_pending', errorCategory: undefined, updatedAt: Date.now() });
  await ctx.scheduler.runAfter(0, internal.accountDeletionActions.processJob, { jobId: job._id });
} });

export const cleanBatch = internalMutation({ args: { jobId: v.id('deletionJobs') }, handler: async (ctx, { jobId }) => {
  const job = await ctx.db.get(jobId);
  if (!job || job.stage !== 'cloud_pending') return false;
  for (const table of privateTables) {
    const rows = await ctx.db.query(table as 'profiles').withIndex('by_owner', q => q.eq('owner', job.owner)).take(50);
    if (!rows.length) continue;
    for (const row of rows) await ctx.db.delete(row._id);
    return true;
  }
  await ctx.db.patch(jobId, { stage: 'revenuecat_pending', updatedAt: Date.now() });
  return false;
} });
export const advance = internalMutation({ args: { jobId: v.id('deletionJobs'), from: stage, to: stage }, handler: async (ctx, { jobId, from, to }) => {
  const job = await ctx.db.get(jobId);
  if (job?.stage === from) await ctx.db.patch(jobId, { stage: to, attempts: 0, errorCategory: undefined, updatedAt: Date.now() });
} });
export const complete = internalMutation({ args: { jobId: v.id('deletionJobs') }, handler: async (ctx, { jobId }) => {
  const job = await ctx.db.get(jobId);
  if (job?.stage !== 'clerk_pending') return;
  const now = Date.now();
  await ctx.db.patch(jobId, { stage: 'completed', completedAt: now, updatedAt: now, errorCategory: undefined });
  await ctx.scheduler.runAfter(20 * 24 * 60 * 60 * 1000, internal.accountDeletion.expire, { jobId });
} });
export const fail = internalMutation({ args: { jobId: v.id('deletionJobs'), retryStage: stage, errorCategory: v.string() }, handler: async (ctx, { jobId, retryStage, errorCategory }) => {
  const job = await ctx.db.get(jobId);
  if (!job || job.stage === 'completed') return;
  const attempts = job.attempts + 1;
  await ctx.db.patch(jobId, { stage: 'retry_required', retryStage, errorCategory, attempts, updatedAt: Date.now() });
  const delay = Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.min(attempts, 7));
  await ctx.scheduler.runAfter(delay, internal.accountDeletion.resume, { jobId });
} });
export const resume = internalMutation({ args: { jobId: v.id('deletionJobs') }, handler: async (ctx, { jobId }) => {
  const job = await ctx.db.get(jobId);
  if (!job || job.stage !== 'retry_required') return;
  await ctx.db.patch(jobId, { stage: job.retryStage ?? 'cloud_pending', updatedAt: Date.now() });
  await ctx.scheduler.runAfter(0, internal.accountDeletionActions.processJob, { jobId });
} });
export const expire = internalMutation({ args: { jobId: v.id('deletionJobs') }, handler: async (ctx, { jobId }) => {
  const job = await ctx.db.get(jobId);
  if (job?.stage !== 'completed' || !job.completedAt) return;
  const remaining = 30 * 24 * 60 * 60 * 1000 - (Date.now() - job.completedAt);
  if (remaining <= 0) await ctx.db.delete(jobId);
  else await ctx.scheduler.runAfter(Math.min(remaining, 20 * 24 * 60 * 60 * 1000), internal.accountDeletion.expire, { jobId });
} });
