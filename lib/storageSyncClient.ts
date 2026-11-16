'use client';

import { createClient } from '@/utils/supabase/client';
import { getCalculationHistory } from '@/lib/historyStorage';
import { getLocalNotes, getLocalTasks, getLocalTaskLists } from '@/lib/notesTasksStorage';
import {
  StorageSnapshot,
  SubscriptionPlanId,
  getCachedStorageSnapshot,
  getPlanLimitBytes,
  getSavedPlanId,
  isValidPlanId,
  markInitialCloudSyncCompleted,
  saveCachedStorageSnapshot,
} from '@/lib/subscriptionPlans';

export function measureUtf8Bytes(data: unknown): number {
  try {
    const raw = typeof data === 'string' ? data : JSON.stringify(data ?? '');
    return new TextEncoder().encode(raw).length;
  } catch {
    return 0;
  }
}

export function buildLocalStorageSnapshot(uid?: string | null): StorageSnapshot {
  const cached = getCachedStorageSnapshot(uid);
  const localCalcs = getCalculationHistory(uid);
  const localNotes = getLocalNotes(uid);
  const localTasks = getLocalTasks(uid);
  const localLists = getLocalTaskLists(uid);

  const calcBytes = localCalcs.length > 0 ? measureUtf8Bytes(localCalcs) : 0;
  const notesBytes = localNotes.length > 0 ? measureUtf8Bytes(localNotes) : 0;
  const tasksBytes =
    (localTasks.length > 0 ? measureUtf8Bytes(localTasks) : 0) +
    (localLists.length > 0 ? measureUtf8Bytes(localLists) : 0);

  const resolvedPlan: SubscriptionPlanId = cached?.planId || getSavedPlanId(uid) || 'starter';
  const limitBytes = cached?.limitBytes || getPlanLimitBytes(resolvedPlan);

  const finalCalcBytes = Math.max(calcBytes, cached?.breakdown.calculationsBytes || 0);
  const finalNotesBytes = Math.max(notesBytes, cached?.breakdown.notesBytes || 0);
  const finalTasksBytes = Math.max(tasksBytes, cached?.breakdown.tasksBytes || 0);

  return {
    planId: resolvedPlan,
    usedBytes: finalCalcBytes + finalNotesBytes + finalTasksBytes,
    limitBytes,
    breakdown: {
      calculationsBytes: finalCalcBytes,
      notesBytes: finalNotesBytes,
      tasksBytes: finalTasksBytes,
    },
    counts: {
      calculations: Math.max(localCalcs.length, cached?.counts.calculations || 0),
      notes: Math.max(localNotes.length, cached?.counts.notes || 0),
      tasks: Math.max(localTasks.length, cached?.counts.tasks || 0),
    },
    syncedAt: cached?.syncedAt || null,
  };
}

/**
 * Recomputes live local usage immediately after adding or deleting items
 * so freed/added storage reflects instantly in quota checks & UI cards.
 */
export function refreshLocalStorageSnapshot(uid?: string | null): StorageSnapshot {
  const cached = getCachedStorageSnapshot(uid);
  const localCalcs = getCalculationHistory(uid);
  const localNotes = getLocalNotes(uid);
  const localTasks = getLocalTasks(uid);
  const localLists = getLocalTaskLists(uid);

  const calcBytes = localCalcs.length > 0 ? measureUtf8Bytes(localCalcs) : 0;
  const notesBytes = localNotes.length > 0 ? measureUtf8Bytes(localNotes) : 0;
  const tasksBytes =
    (localTasks.length > 0 ? measureUtf8Bytes(localTasks) : 0) +
    (localLists.length > 0 ? measureUtf8Bytes(localLists) : 0);

  const resolvedPlan: SubscriptionPlanId = cached?.planId || getSavedPlanId(uid) || 'starter';
  const limitBytes = cached?.limitBytes || getPlanLimitBytes(resolvedPlan);

  const snapshot: StorageSnapshot = {
    planId: resolvedPlan,
    usedBytes: calcBytes + notesBytes + tasksBytes,
    limitBytes,
    breakdown: {
      calculationsBytes: calcBytes,
      notesBytes: notesBytes,
      tasksBytes: tasksBytes,
    },
    counts: {
      calculations: localCalcs.length,
      notes: localNotes.length,
      tasks: localTasks.length,
    },
    syncedAt: cached?.syncedAt || null,
  };

  saveCachedStorageSnapshot(uid, snapshot);
  return snapshot;
}

export interface QuotaCheckResult {
  allowed: boolean;
  usedBytes: number;
  limitBytes: number;
  projectedBytes: number;
  snapshot: StorageSnapshot;
}

export function checkStorageQuotaBeforeAdd(
  uid?: string | null,
  incomingPayload?: unknown,
  freedPayload?: unknown
): QuotaCheckResult {
  const snapshot = buildLocalStorageSnapshot(uid);
  const incomingBytes = incomingPayload !== undefined ? measureUtf8Bytes(incomingPayload) : 0;
  const freedBytes = freedPayload !== undefined ? measureUtf8Bytes(freedPayload) : 0;
  const effectiveBaseBytes = Math.max(0, snapshot.usedBytes - freedBytes);
  const projectedBytes = effectiveBaseBytes + incomingBytes;
  const allowed =
    freedBytes > 0
      ? projectedBytes <= snapshot.limitBytes
      : snapshot.usedBytes < snapshot.limitBytes && projectedBytes <= snapshot.limitBytes;

  return {
    allowed,
    usedBytes: snapshot.usedBytes,
    limitBytes: snapshot.limitBytes,
    projectedBytes,
    snapshot,
  };
}

export function triggerStorageFullPopup(
  snapshot?: StorageSnapshot | null,
  uid?: string | null
): void {
  if (typeof window === 'undefined') return;
  const resolved = snapshot || buildLocalStorageSnapshot(uid);
  window.dispatchEvent(
    new CustomEvent('calcmax:storage-full', {
      detail: { snapshot: resolved },
    })
  );
}

export async function fetchAndCacheStorageSnapshot(
  uid?: string | null
): Promise<StorageSnapshot> {
  const localCalcs = getCalculationHistory(uid);
  const localNotes = getLocalNotes(uid);
  const localTasks = getLocalTasks(uid);
  const localLists = getLocalTaskLists(uid);

  const localCalcBytes = localCalcs.length > 0 ? measureUtf8Bytes(localCalcs) : 0;
  const localNotesBytes = localNotes.length > 0 ? measureUtf8Bytes(localNotes) : 0;
  const localTasksBytes =
    (localTasks.length > 0 ? measureUtf8Bytes(localTasks) : 0) +
    (localLists.length > 0 ? measureUtf8Bytes(localLists) : 0);

  let finalCalcBytes = localCalcBytes;
  let finalNotesBytes = localNotesBytes;
  let finalTasksBytes = localTasksBytes;
  let finalCalcCount = localCalcs.length;
  let finalNotesCount = localNotes.length;
  let finalTasksCount = localTasks.length;
  let resolvedPlan: SubscriptionPlanId = getSavedPlanId(uid) || 'starter';
  let resolvedLimitBytes = getPlanLimitBytes(resolvedPlan);

  if (uid) {
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch('/api/storage', {
        method: 'GET',
        headers,
        cache: 'no-store',
      });

      if (res.ok) {
        const cloudData = await res.json();
        finalCalcBytes = Math.max(
          localCalcBytes,
          Number(cloudData.breakdown?.calculationsBytes) || 0
        );
        finalNotesBytes = Math.max(
          localNotesBytes,
          Number(cloudData.breakdown?.notesBytes) || 0
        );
        finalTasksBytes = Math.max(
          localTasksBytes,
          Number(cloudData.breakdown?.tasksBytes) || 0
        );
        finalCalcCount = Math.max(
          localCalcs.length,
          Number(cloudData.counts?.calculations) || 0
        );
        finalNotesCount = Math.max(
          localNotes.length,
          Number(cloudData.counts?.notes) || 0
        );
        finalTasksCount = Math.max(
          localTasks.length,
          Number(cloudData.counts?.tasks) || 0
        );

        if (isValidPlanId(cloudData.planId)) {
          resolvedPlan = cloudData.planId;
        } else {
          resolvedPlan = 'starter';
        }
        resolvedLimitBytes = Math.max(
          Number(cloudData.limitBytes) || 0,
          getPlanLimitBytes(resolvedPlan)
        );
      }
    } catch {
      // Offline fallback to local measurements
    }
  }

  const snapshot: StorageSnapshot = {
    planId: resolvedPlan,
    usedBytes: finalCalcBytes + finalNotesBytes + finalTasksBytes,
    limitBytes: resolvedLimitBytes,
    breakdown: {
      calculationsBytes: finalCalcBytes,
      notesBytes: finalNotesBytes,
      tasksBytes: finalTasksBytes,
    },
    counts: {
      calculations: finalCalcCount,
      notes: finalNotesCount,
      tasks: finalTasksCount,
    },
    syncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  saveCachedStorageSnapshot(uid, snapshot);
  markInitialCloudSyncCompleted();
  return snapshot;
}
