import { defineSchema, defineTable } from 'convex/server';
import { v, type PropertyValidators } from 'convex/values';

const owned = { owner: v.string(), clientId: v.string(), updatedAt: v.number() };
const indexed = <T extends PropertyValidators>(fields: T) => defineTable(fields).index('by_owner', ['owner']).index('by_owner_client', ['owner', 'clientId']);

export default defineSchema({
  profiles: indexed({ ...owned, name: v.string(), birthDate: v.string(), heightCm: v.number(), startWeight: v.number(), targetWeight: v.optional(v.number()), experience: v.string(), fitnessGoal: v.string(), growthGoals: v.string(), language: v.string(), completedAt: v.string() }),
  habits: indexed({ ...owned, name: v.string(), description: v.string(), category: v.string(), icon: v.string(), frequency: v.union(v.literal('daily'), v.literal('days'), v.literal('quota')), days: v.array(v.number()), weeklyTarget: v.number(), startDate: v.string(), archived: v.boolean(), reminderTime: v.optional(v.string()), createdAt: v.string() }),
  habitCompletions: indexed({ ...owned, habitClientId: v.string(), day: v.string(), createdAt: v.string() }).index('by_owner_habit', ['owner', 'habitClientId']),
  missions: indexed({ ...owned, title: v.string(), type: v.union(v.literal('manual'), v.literal('habits'), v.literal('workouts'), v.literal('weight')), target: v.number(), period: v.union(v.literal('daily'), v.literal('weekly')), active: v.boolean(), createdAt: v.string() }),
  missionCompletions: indexed({ ...owned, missionClientId: v.string(), day: v.string() }).index('by_owner_mission', ['owner', 'missionClientId']),
  exercises: indexed({ ...owned, name: v.string(), metric: v.union(v.literal('weight_reps'), v.literal('reps'), v.literal('duration')), custom: v.boolean() }),
  routines: indexed({ ...owned, name: v.string(), exerciseClientIds: v.array(v.string()), createdAt: v.string() }),
  workouts: indexed({ ...owned, name: v.string(), day: v.string(), startedAt: v.string(), durationMin: v.optional(v.number()), notes: v.string(), completed: v.boolean(), createdAt: v.string(), exercises: v.array(v.object({ clientId: v.string(), exerciseClientId: v.string(), position: v.number(), sets: v.array(v.object({ clientId: v.string(), setNumber: v.number(), reps: v.optional(v.number()), weightKg: v.optional(v.number()), durationSec: v.optional(v.number()), note: v.string(), completed: v.boolean() })) })) }).index('by_owner_day', ['owner', 'day']),
  weights: indexed({ ...owned, day: v.string(), kg: v.number(), note: v.string(), createdAt: v.string() }).index('by_owner_day', ['owner', 'day']),
  measurements: indexed({ ...owned, day: v.string(), type: v.string(), value: v.number(), unit: v.string() }).index('by_owner_day', ['owner', 'day']),
  restDays: indexed({ ...owned, day: v.string() }),
  favorites: indexed({ ...owned, cardId: v.string() }),
  preferences: indexed({ ...owned, key: v.string(), value: v.string() }),
  syncRecords: defineTable({ owner: v.string(), kind: v.string(), clientId: v.string(), payload: v.union(v.string(), v.null()), revision: v.number(), deleted: v.boolean(), updatedAt: v.number() }).index('by_owner', ['owner']).index('by_owner_kind_id', ['owner', 'kind', 'clientId']),
  syncOperations: defineTable({ owner: v.string(), operationId: v.string(), kind: v.optional(v.string()), clientId: v.optional(v.string()), payload: v.optional(v.union(v.string(), v.null())), revision: v.number() }).index('by_owner_operation', ['owner', 'operationId']),
});
