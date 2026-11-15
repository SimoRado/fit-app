import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/expo';
import { useConvex, useConvexAuth } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { getLocalAccount } from '../data/db';
import { acknowledge, applyCloud, chooseSync, localPayload, localRevision, localSyncStatus, markConflict, markFailure, pendingOperations, recordSyncSuccess, retrySyncFailures, type SyncChoice } from '../data/syncLocal';
import { runSyncCycle } from '../services/syncEngine';
import { useApp } from './app';
import { reportFailure } from '../core/monitoring';

type Phase = 'local' | 'waiting' | 'syncing' | 'synced' | 'offline' | 'error' | 'conflict';
type Failure = { kind: string; action: string; operation_id: string; category: string; detail: string; next_retry_at: number };
type State = { phase: Phase; choice: SyncChoice; pending: number; conflicts: number; failureCount: number; failures: Failure[]; lastCheck: string | null; error: string | null; enable: () => Promise<void>; keepLocal: () => Promise<void>; retry: () => Promise<void> };
const Context = createContext<State | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const client = useConvex();
  const { revision, refresh } = useApp();
  const [choice, setChoice] = useState<SyncChoice>('ask');
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [failureCount, setFailureCount] = useState(0);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('waiting');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    const owner = userId;
    const current = () => active && !!owner && getLocalAccount() === owner;
    const run = async () => {
      if (!current() || busy.current) return;
      busy.current = true;
      try {
        const status = await localSyncStatus();
        if (!current()) return;
        setChoice(status.choice); setPending(status.pending); setConflicts(status.conflicts); setFailureCount(status.failureCount); setFailures(status.failures); setLastCheck(status.lastCheck);
        if (status.choice !== 'enabled') { setPhase('local'); return; }
        if (!isAuthenticated) { setPhase('waiting'); return; }
        setPhase('syncing'); setError(null);
        const applied = await runSyncCycle(owner!, current, {
          apply: args => client.mutation(api.sync.apply, args),
          page: cursor => client.query(api.sync.page, { paginationOpts: { numItems: 100, cursor } }),
        }, { pendingOperations, localPayload, localRevision, acknowledge, markConflict, markFailure, recordSuccess: recordSyncSuccess, applyCloud });
        if (!current()) return;
        if (applied.applied) await refresh();
        const after = await localSyncStatus();
        if (!current()) return;
        setPending(after.pending); setConflicts(after.conflicts + applied.conflicts); setFailureCount(after.failureCount); setFailures(after.failures); setLastCheck(after.lastCheck);
        setPhase(after.conflicts || applied.conflicts ? 'conflict' : after.failures.some(f => f.category === 'validation' || f.category === 'auth') ? 'error' : after.pending ? 'waiting' : 'synced');
      } catch (cause) {
        if (current()) {
          const detail = cause instanceof Error ? cause.message : '';
          const offline = /network|fetch|connection|offline/i.test(detail);
          if (!offline) reportFailure('cloud-sync', cause);
          setError(offline ? 'Connection unavailable. Changes remain on this device.' : 'Sync paused after an error. Changes remain on this device.');
          setPhase(offline ? 'offline' : 'error');
        }
      } finally { busy.current = false; }
    };
    // Each local change bumps `revision`; wait briefly so a sync cycle (status queries, network,
    // acknowledgements) never competes with the user's own saves and screen reloads.
    const kick = setTimeout(() => { void run(); }, 1500);
    const timer = setInterval(() => { void run(); }, 20000);
    return () => { active = false; clearTimeout(kick); clearInterval(timer); };
  }, [client, isAuthenticated, userId, revision, nonce, refresh]);

  async function enable() { await chooseSync('enabled'); setChoice('enabled'); setNonce(value => value + 1); }
  async function keepLocal() { await chooseSync('local'); setChoice('local'); setPhase('local'); setNonce(value => value + 1); }
  async function retry() { await retrySyncFailures(); setNonce(value => value + 1); }
  return <Context.Provider value={{ phase, choice, pending, conflicts, failureCount, failures, lastCheck, error, enable, keepLocal, retry }}>{children}</Context.Provider>;
}
export function useSync() { const value = useContext(Context); if (!value) throw Error('SyncProvider missing'); return value; }
