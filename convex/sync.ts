import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { mutation, query, type MutationCtx } from './_generated/server';
import { day, requireOwner, timestamp } from './security';
import { historySnapshotWins, kinds, syncRecordFields, type Kind } from './syncContract';

const kind = v.union(...kinds.map(v.literal));
const parent: Partial<Record<Kind, { kind: Kind; field: string }>> = {
  habits: { kind: 'profile', field: 'owner_id' }, missions: { kind: 'profile', field: 'owner_id' }, routines: { kind: 'profile', field: 'owner_id' },
  workouts: { kind: 'profile', field: 'owner_id' }, weights: { kind: 'profile', field: 'owner_id' }, measurements: { kind: 'profile', field: 'owner_id' },
  rest_days: { kind: 'profile', field: 'owner_id' }, favorites: { kind: 'profile', field: 'owner_id' },
  habit_completions: { kind: 'habits', field: 'habit_id' }, habit_progress: { kind: 'habits', field: 'habit_id' }, mission_completions: { kind: 'missions', field: 'mission_id' },
  routine_exercises: { kind: 'routines', field: 'routine_id' }, workout_exercises: { kind: 'workouts', field: 'workout_id' },
  workout_sets: { kind: 'workout_exercises', field: 'workout_exercise_id' },
  nutrition_preferences: { kind: 'profile', field: 'owner_id' }, nutrition_targets: { kind: 'profile', field: 'owner_id' }, custom_foods: { kind: 'profile', field: 'owner_id' }, food_entries: { kind: 'profile', field: 'owner_id' },
  habit_days: { kind: 'profile', field: 'owner_id' },
};
const seedExercises = new Set(['bench','squat','deadlift','shoulder','curl','pullup','lat','legpress','plank','running']);
const numeric: Partial<Record<Kind, readonly string[]>> = {
  profile: ['height_cm','start_weight','target_weight'], exercises: ['custom'], habits: ['weekly_target','archived','target_value','increment','reminder_enabled','sort_order'], habit_progress: ['amount','target_snapshot'],
  missions: ['target','active'], routine_exercises: ['position'], workouts: ['duration_min','completed','elapsed_seconds','running_since_ms','paused_since_ms','paused_seconds','finished_at_ms'],
  workout_exercises: ['position'], workout_sets: ['set_number','reps','weight_kg','duration_sec','completed'],
  weights: ['kg'], measurements: ['value'],
  nutrition_preferences: ['enabled'], nutrition_targets: ['kcal','protein','carbs','fat'], custom_foods: ['kcal_100','protein_100','carbs_100','fat_100'], food_entries: ['grams','kcal','protein','carbs','fat','kcal_100','protein_100','carbs_100','fat_100'],
  habit_days: ['eligible','completed','percent'],
};
const nullable = new Set(['target_weight','reminder_time','duration_min','reps','weight_kg','duration_sec','food_id','catalog_food_id','grams','kcal_100','protein_100','carbs_100','fat_100','running_since_ms','paused_since_ms','finished_at_ms']);
const integral = new Set(['eligible','custom','weekly_target','archived','reminder_enabled','sort_order','target','active','position','duration_min','completed','set_number','reps','duration_sec','enabled','elapsed_seconds','running_since_ms','paused_since_ms','paused_seconds','finished_at_ms']);
const nonnegative = new Set(['eligible','percent','position','sort_order','amount','duration_min','reps','weight_kg','duration_sec','value','grams','kcal','protein','carbs','fat','kcal_100','protein_100','carbs_100','fat_100','elapsed_seconds','running_since_ms','paused_since_ms','paused_seconds','finished_at_ms']);
const booleanNumber = new Set(['custom','archived','reminder_enabled','active','completed','enabled']);

function parseRow(kind: Kind, id: string, payload: string) {
  if (payload.length > 20000) throw Error('Record too large');
  let raw: unknown;
  try { raw = JSON.parse(payload); } catch { throw Error('Invalid record'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Invalid record');
  const row = raw as Record<string, unknown>;
  const allowed = syncRecordFields[kind];
  const legacyHabit = kind === 'habits' && Object.keys(row).length === allowed.length - 7 && allowed.slice(0, -7).every(key => key in row);
  const legacyFoodEntry = kind === 'food_entries' && Object.keys(row).length === allowed.length - 1 && allowed.slice(0, -1).every(key => key in row);
  if (!legacyHabit && !legacyFoodEntry && (Object.keys(row).length !== allowed.length || allowed.some(key => !(key in row)))) throw Error('Invalid record fields');
  for (const [field, value] of Object.entries(row)) {
    if (value === null && nullable.has(field) && !(kind === 'custom_foods' && field.endsWith('_100'))) continue;
    if (numeric[kind]?.includes(field)) {
      const max = field.endsWith('_ms') ? 1e13 : 1e9;
      if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > max || (integral.has(field) && !Number.isInteger(value)) || (nonnegative.has(field) && value < 0) || (booleanNumber.has(field) && kind !== 'habit_days' && value !== 0 && value !== 1)) throw Error('Invalid record value');
    } else if (typeof value !== 'string' || value.length > (field === 'notes' || field === 'description' ? 10000 : kind === 'habit_days' && field === 'items' ? 16000 : 2000) || (['id','owner_id','habit_id','mission_id','routine_id','workout_id','workout_exercise_id','exercise_id','key'].includes(field) && !value)) throw Error('Invalid record value');
  }
  for (const field of ['day','birth_date','start_date','effective_day']) if (typeof row[field] === 'string') day(row[field]);
  for (const field of ['created_at','completed_at','started_at','updated_at']) if (typeof row[field] === 'string') timestamp(row[field]);
  if (kind === 'weights' && (row.kg as number) <= 0) throw Error('Invalid weight');
  if (kind === 'profile' && ((row.height_cm as number) <= 0 || (row.start_weight as number) <= 0 || (row.target_weight !== null && (row.target_weight as number) <= 0))) throw Error('Invalid profile');
  if (kind === 'habits' && (!['daily','days','quota'].includes(String(row.frequency)) || (row.weekly_target as number) < 1 || (row.weekly_target as number) > 7)) throw Error('Invalid habit');
  if (kind === 'habits' && !legacyHabit) {
    if (!['boolean','quantity'].includes(String(row.habit_type)) || (row.target_value as number) <= 0 || (row.increment as number) <= 0 || (row.target_value as number) > 1000000 || (row.increment as number) > 1000000) throw Error('Invalid habit target');
    let times: unknown;
    try { times = JSON.parse(String(row.reminder_times)); } catch { throw Error('Invalid reminder times'); }
    if (!Array.isArray(times) || times.length > 6 || times.some(time => typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw Error('Invalid reminder times');
  }
  if (kind === 'habit_progress' && ((row.amount as number) > 100000000 || (row.target_snapshot as number) <= 0 || row.id !== `${row.habit_id}:${row.day}`)) throw Error('Invalid habit progress');
  if (kind === 'habit_days') validHistoryDay(row);
  if (kind === 'exercises' && !['weight_reps','reps','duration'].includes(String(row.metric))) throw Error('Invalid exercise');
  if (kind === 'profile' && !['en','fr','ar'].includes(String(row.language))) throw Error('Invalid language');
  if (kind === 'nutrition_targets' && (row.kcal as number) <= 0) throw Error('Invalid calorie target');
  if (kind === 'nutrition_targets' && row.id !== `${row.owner_id}:${row.effective_day}`) throw Error('Invalid target ID');
  if (kind === 'food_entries' && (!['breakfast','lunch','dinner','snacks'].includes(String(row.meal)) || (row.grams !== null && (row.grams as number) <= 0))) throw Error('Invalid food entry');
  if (kind === 'workouts' && !['draft','running','paused','completed'].includes(String(row.session_status))) throw Error('Invalid workout status');
  if ((kind === 'custom_foods' || kind === 'food_entries') && !(row.name as string).trim()) throw Error('Invalid food name');
  if ((kind === 'custom_foods' || kind === 'food_entries') && (row.name as string).length > 120) throw Error('Invalid food name');
  if (kind === 'food_entries' && row.grams !== null && (row.grams as number) > 10000) throw Error('Invalid portion');
  if (kind === 'food_entries' && row.catalog_food_id != null && !/^fd_[A-Za-z0-9]+$/.test(String(row.catalog_food_id))) throw Error('Invalid catalog food ID');
  if (kind === 'nutrition_targets' || kind === 'custom_foods' || kind === 'food_entries') {
    const limit = (field: string) => field === 'kcal' || field === 'kcal_100' ? 10000 : 2000;
    for (const [field, value] of Object.entries(row)) if (['kcal','protein','carbs','fat','kcal_100','protein_100','carbs_100','fat_100'].includes(field) && value !== null && (value as number) > limit(field)) throw Error('Invalid nutrition value');
  }
  const expected = kind === 'habit_completions' || kind === 'habit_progress' ? `${row.habit_id}:${row.day}`
    : kind === 'mission_completions' ? `${row.mission_id}:${row.day}`
    : kind === 'rest_days' ? `${row.owner_id}:${row.day}`
    : kind === 'favorites' ? `${row.owner_id}:${row.card_id}`
    : kind === 'preferences' ? row.key : kind === 'nutrition_preferences' ? row.owner_id : row.id;
  if (expected !== id) throw Error('Record ID mismatch');
  if (kind === 'exercises' && row.custom !== 1) throw Error('Only custom exercises may sync');
  return row;
}

/** A History day snapshot must be internally consistent: counts derive from its own items. */
function validHistoryDay(row: Record<string, unknown>) {
  if (!['open','final'].includes(String(row.status)) || !['tracked','reconstructed'].includes(String(row.source)) || row.id !== `${row.owner_id}:${row.day}`) throw Error('Invalid habit history');
  let items: unknown;
  try { items = JSON.parse(String(row.items)); } catch { throw Error('Invalid habit history'); }
  if (!Array.isArray(items) || items.length > 200) throw Error('Invalid habit history');
  for (const item of items as Record<string, unknown>[]) {
    if (!item || typeof item !== 'object' || typeof item.h !== 'string' || !item.h || item.h.length > 200 || typeof item.n !== 'string' || item.n.length > 200 || (item.d !== 0 && item.d !== 1) || (item.t !== 'b' && item.t !== 'q')) throw Error('Invalid habit history');
    for (const key of ['g','a'] as const) if (item[key] !== undefined && (typeof item[key] !== 'number' || !Number.isFinite(item[key]) || (item[key] as number) < 0 || (item[key] as number) > 100000000)) throw Error('Invalid habit history');
  }
  const done = (items as { d: number }[]).reduce((sum, item) => sum + item.d, 0);
  const eligible = row.eligible as number, completed = row.completed as number, percent = row.percent as number;
  if (eligible !== items.length || completed !== done || percent > 100 || Math.abs(percent - (eligible ? completed / eligible * 100 : 0)) > 0.001) throw Error('Invalid habit history');
}

async function ownedRecord(ctx: MutationCtx, owner: string, kind: Kind, clientId: string) {
  return ctx.db.query('syncRecords').withIndex('by_owner_kind_id', q => q.eq('owner', owner).eq('kind', kind).eq('clientId', clientId)).unique();
}

export const apply = mutation({ args: { kind, clientId: v.string(), payload: v.union(v.string(), v.null()), expectedRevision: v.number(), operationId: v.string() }, handler: async (ctx, args) => {
  const owner = await requireOwner(ctx);
  if (!args.clientId || args.clientId.length > 200 || !/^[0-9a-f]{32}$/.test(args.operationId) || !Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0) throw Error('Invalid sync operation');
  const prior = await ctx.db.query('syncOperations').withIndex('by_owner_operation', q => q.eq('owner', owner).eq('operationId', args.operationId)).unique();
  if (prior) {
    if (prior.kind !== args.kind || prior.clientId !== args.clientId || prior.payload !== args.payload) throw Error('Operation ID reused with different data');
    return { status: 'applied' as const, revision: prior.revision };
  }
  const row = args.payload === null ? null : parseRow(args.kind, args.clientId, args.payload);
  if (row) {
    const relation = parent[args.kind];
    if (relation) {
      const parentId = row[relation.field];
      if (typeof parentId !== 'string') throw Error('Parent record is not synchronized');
      const linked = await ownedRecord(ctx, owner, relation.kind, parentId);
      if (!linked || linked.deleted) throw Error('Parent record is not synchronized');
    }
    if (args.kind === 'food_entries' && row.food_id !== null) {
      const food = await ownedRecord(ctx, owner, 'custom_foods', String(row.food_id));
      if (!food || food.deleted) throw Error('Custom food is not synchronized');
    }
    if ((args.kind === 'routine_exercises' || args.kind === 'workout_exercises') && !seedExercises.has(String(row.exercise_id)) && !/^catalog:\d{4}$/.test(String(row.exercise_id))) {
      const exercise = await ownedRecord(ctx, owner, 'exercises', String(row.exercise_id));
      if (!exercise || exercise.deleted) throw Error('Exercise is not synchronized');
    }
  }
  const existing = await ownedRecord(ctx, owner, args.kind, args.clientId);
  const currentRevision = existing?.revision ?? 0;
  if (args.kind === 'profile' && !existing && args.payload !== null) {
    const profiles = await ctx.db.query('syncRecords').withIndex('by_owner_kind_id', q => q.eq('owner', owner).eq('kind', 'profile')).collect();
    if (profiles.some(profile => !profile.deleted)) return { status: 'conflict' as const, revision: 0 };
  }
  if ((args.kind === 'habit_completions' || args.kind === 'mission_completions') && existing && !existing.deleted && args.payload !== null) {
    await ctx.db.insert('syncOperations', { owner, operationId: args.operationId, kind: args.kind, clientId: args.clientId, payload: args.payload, revision: currentRevision });
    return { status: 'applied' as const, revision: currentRevision };
  }
  // History snapshots are derived summaries: resolve concurrent writers by the shared rule
  // (final beats open, then newest) instead of leaving a permanent revision conflict.
  if (args.kind === 'habit_days' && existing && !existing.deleted && existing.payload && args.payload !== null && existing.payload !== args.payload && currentRevision !== args.expectedRevision) {
    if (!historySnapshotWins(row ?? {}, JSON.parse(existing.payload) as Record<string, unknown>)) return { status: 'conflict' as const, revision: currentRevision };
    const revision = currentRevision + 1;
    await ctx.db.patch(existing._id, { payload: args.payload, deleted: false, revision, updatedAt: Date.now() });
    await ctx.db.insert('syncOperations', { owner, operationId: args.operationId, kind: args.kind, clientId: args.clientId, payload: args.payload, revision });
    return { status: 'applied' as const, revision };
  }
  if (!existing && args.payload === null && args.expectedRevision === 0) {
    await ctx.db.insert('syncOperations', { owner, operationId: args.operationId, kind: args.kind, clientId: args.clientId, payload: args.payload, revision: 0 });
    return { status: 'applied' as const, revision: 0 };
  }
  if (currentRevision !== args.expectedRevision && !(existing && existing.payload === args.payload && existing.deleted === (args.payload === null))) {
    return { status: 'conflict' as const, revision: currentRevision };
  }
  const revision = currentRevision === args.expectedRevision ? currentRevision + 1 : currentRevision;
  if (existing && revision !== currentRevision) await ctx.db.patch(existing._id, { payload: args.payload, deleted: args.payload === null, revision, updatedAt: Date.now() });
  else if (!existing && args.payload !== null) await ctx.db.insert('syncRecords', { owner, kind: args.kind, clientId: args.clientId, payload: args.payload, revision, deleted: false, updatedAt: Date.now() });
  await ctx.db.insert('syncOperations', { owner, operationId: args.operationId, kind: args.kind, clientId: args.clientId, payload: args.payload, revision });
  return { status: 'applied' as const, revision };
} });

export const page = query({ args: { paginationOpts: paginationOptsValidator }, handler: async (ctx, { paginationOpts }) => {
  const owner = await requireOwner(ctx);
  if (paginationOpts.numItems > 100) throw Error('Page too large');
  return ctx.db.query('syncRecords').withIndex('by_owner', q => q.eq('owner', owner)).paginate(paginationOpts);
} });
