import { createClient } from '@/utils/supabase/client';

export interface CalculationDetails {
  id?: string;
  type: 'Discount' | 'Weight' | 'Unit' | 'EMI' | 'Wishlist' | 'Currency' | 'Age' | 'Calculator' | string;
  details: string;
  result: string;
  timestamp?: string;
  createdAt?: string;
  dbId?: string | number | null;
  syncStatus?: 'synced' | 'syncing' | 'local' | 'error';
  savedAmount?: number;
  isFavorite?: boolean;
}

export interface HistoryItem {
  id: string;
  type: 'Discount' | 'Weight' | 'Unit' | 'EMI' | 'Wishlist' | 'Currency' | 'Age' | 'Calculator' | string;
  details: string;
  result: string;
  timestamp: string;
  createdAt?: string;
  dbId?: string | number | null;
  syncStatus?: 'synced' | 'syncing' | 'local' | 'error';
  savedAmount?: number;
  isFavorite?: boolean;
}

export type CalculationOfflineSyncOpType = 'upsert_calculation' | 'delete_calculation';

export interface CalculationOfflineSyncOp {
  opKey: string;
  type: CalculationOfflineSyncOpType;
  item?: HistoryItem;
  deletePayload?: {
    id: string;
    dbId?: string | number | null;
    details?: string;
    result?: string;
    type?: string;
    all?: boolean;
  };
  updatedAt: string;
}

const BASE_STORAGE_KEY = 'retail-calc-history';
const CALC_SYNC_OUTBOX_PREFIX = 'retailcalc_history_sync_outbox_';
const inFlightCalcSyncByUser = new Map<string, Promise<{ syncedCount: number; pendingCount: number }>>();

export function getStorageKey(userId?: string | null): string {
  if (userId && typeof userId === 'string' && userId.trim()) {
    return `${BASE_STORAGE_KEY}-${userId.trim()}`;
  }
  return `${BASE_STORAGE_KEY}-guest`;
}

/**
 * Retrieves the stored history array from local storage for a specific user ID or guest.
 * If no data exists or an error occurs, returns an empty array.
 */
export function getCalculationHistory(userId?: string | null): HistoryItem[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const key = getStorageKey(userId);
    let storedData = localStorage.getItem(key);

    // If scoped key has no items yet and no specific user, fallback to base key
    if (!storedData && !userId) {
      storedData = localStorage.getItem(BASE_STORAGE_KEY);
    }

    if (!storedData) {
      return [];
    }
    const parsed = JSON.parse(storedData);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to retrieve calculation history from local storage:', error);
    return [];
  }
}

/**
 * Saves a calculation detail object into local storage for a specific user ID or guest.
 * @param calculationDetails Object containing calculation details
 * @param userId Optional user UID for user-specific history scoping
 * @returns The updated array of history items
 */
export function saveCalculationHistory(
  calculationDetails: CalculationDetails,
  userId?: string | null
): HistoryItem[] {
  const existingHistory = getCalculationHistory(userId);

  const newItem: HistoryItem = {
    id: calculationDetails.id || Date.now().toString() + Math.random().toString(36).substring(2, 5),
    type: calculationDetails.type,
    details: calculationDetails.details,
    result: calculationDetails.result,
    createdAt: calculationDetails.createdAt || new Date().toISOString(),
    timestamp: calculationDetails.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    dbId: calculationDetails.dbId,
    syncStatus: calculationDetails.syncStatus || 'local',
    savedAmount: calculationDetails.savedAmount,
    isFavorite: Boolean(calculationDetails.isFavorite),
  };

  // Prepend new calculation to existing array (limiting to last 50 entries)
  const updatedHistory = [newItem, ...existingHistory.filter((item) => item.id !== newItem.id)].slice(0, 50);

  if (typeof window !== 'undefined') {
    try {
      const key = getStorageKey(userId);
      localStorage.setItem(key, JSON.stringify(updatedHistory));
      if (!userId) {
        localStorage.setItem(BASE_STORAGE_KEY, JSON.stringify(updatedHistory));
      }
    } catch (error) {
      console.error('Failed to save calculation history to local storage:', error);
    }
  }

  return updatedHistory;
}

/**
 * Directly overwrites the calculation history for a specific user ID.
 */
export function setCalculationHistory(items: HistoryItem[], userId?: string | null): void {
  if (typeof window !== 'undefined') {
    try {
      const key = getStorageKey(userId);
      localStorage.setItem(key, JSON.stringify(items.slice(0, 50)));
      if (!userId) {
        localStorage.setItem(BASE_STORAGE_KEY, JSON.stringify(items.slice(0, 50)));
      }
    } catch (error) {
      console.error('Failed to set calculation history in local storage:', error);
    }
  }
}

/**
 * Deletes a single calculation history item by ID or item object from local storage for a specific user ID or guest.
 * @param itemOrId The unique ID of the item to delete or the full HistoryItem object
 * @param userId Optional user UID for user-specific history scoping
 * @returns The updated array of history items
 */
export function deleteCalculationHistoryItem(
  itemOrId: string | { id?: string; dbId?: string | number | null; details?: string; result?: string; type?: string },
  userId?: string | null
): HistoryItem[] {
  const existingHistory = getCalculationHistory(userId);
  
  let targetId: string | null = null;
  let targetDbId: string | null = null;
  let targetDetails: string | null = null;
  let targetResult: string | null = null;
  let targetType: string | null = null;

  if (typeof itemOrId === 'string') {
    targetId = itemOrId;
    targetDbId = itemOrId;
  } else if (itemOrId && typeof itemOrId === 'object') {
    targetId = itemOrId.id || null;
    targetDbId = itemOrId.dbId ? itemOrId.dbId.toString() : null;
    targetDetails = itemOrId.details || null;
    targetResult = itemOrId.result || null;
    targetType = itemOrId.type || null;
  }

  const updatedHistory = existingHistory.filter((item) => {
    // Check ID match
    if (targetId && item.id === targetId) return false;
    // Check dbId match
    if (targetDbId && item.dbId && item.dbId.toString() === targetDbId) return false;
    // Check content match
    if (targetDetails && targetResult && item.details === targetDetails && item.result === targetResult) {
      if (!targetType || item.type === targetType) return false;
    }
    return true;
  });

  if (typeof window !== 'undefined') {
    try {
      const key = getStorageKey(userId);
      localStorage.setItem(key, JSON.stringify(updatedHistory));
      
      // Also clean up base key and guest key if matching items exist there
      const guestKey = `${BASE_STORAGE_KEY}-guest`;
      [BASE_STORAGE_KEY, guestKey].forEach((k) => {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const filtered = parsed.filter((item) => {
                if (targetId && item.id === targetId) return false;
                if (targetDbId && item.dbId && item.dbId.toString() === targetDbId) return false;
                if (targetDetails && targetResult && item.details === targetDetails && item.result === targetResult) return false;
                return true;
              });
              localStorage.setItem(k, JSON.stringify(filtered));
            }
          }
        } catch {
          // ignore
        }
      });
    } catch (error) {
      console.error('Failed to delete calculation history item from local storage:', error);
    }
  }

  return updatedHistory;
}

/**
 * Clears the stored calculation history from local storage for a specific user ID or guest.
 */
export function clearCalculationHistory(userId?: string | null): HistoryItem[] {
  if (typeof window !== 'undefined') {
    try {
      const key = getStorageKey(userId);
      localStorage.removeItem(key);
      localStorage.removeItem(BASE_STORAGE_KEY);
      localStorage.removeItem(`${BASE_STORAGE_KEY}-guest`);
    } catch (error) {
      console.error('Failed to clear calculation history from local storage:', error);
    }
  }
  return [];
}

/**
 * Toggles the favorite flag for a calculation history item and persists across local caches.
 */
export function toggleCalculationHistoryFavorite(
  itemId: string,
  userId?: string | null
): HistoryItem[] {
  const existingHistory = getCalculationHistory(userId);
  const updatedHistory = existingHistory.map((item) =>
    item.id === itemId || (item.dbId && item.dbId.toString() === itemId)
      ? { ...item, isFavorite: !item.isFavorite }
      : item
  );

  if (typeof window !== 'undefined') {
    try {
      const key = getStorageKey(userId);
      localStorage.setItem(key, JSON.stringify(updatedHistory.slice(0, 50)));
      if (!userId) {
        localStorage.setItem(BASE_STORAGE_KEY, JSON.stringify(updatedHistory.slice(0, 50)));
      }
    } catch (error) {
      console.error('Failed to update favorite status in local storage:', error);
    }
  }

  return updatedHistory;
}

/**
 * Extracts numeric money saved from calculation details or result string for gamified summaries.
 */
export function parseSavedAmountFromText(type?: string, details?: string, result?: string): number {
  try {
    const combined = `${details || ''} ${result || ''}`;
    
    // 1. Discount specific patterns: Total Savings: $200.00 or Savings: 50
    const savingsMatch = combined.match(/(?:total savings|savings|saved)[\s:]*([^\d\s]+)?\s*([\d,]+(?:\.\d+)?)/i);
    if (savingsMatch && savingsMatch[2]) {
      const parsed = parseFloat(savingsMatch[2].replace(/,/g, ''));
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    // 2. Wishlist already saved pattern: Already Saved: 15,000
    const wishlistMatch = combined.match(/(?:already saved|saved amount|saved)[\s:]*([^\d\s]+)?\s*([\d,]+(?:\.\d+)?)/i);
    if (wishlistMatch && wishlistMatch[2]) {
      const parsed = parseFloat(wishlistMatch[2].replace(/,/g, ''));
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // Ignore regex parsing error
  }
  return 0;
}

// ----------------- OFFLINE SYNC OUTBOX & AUTOMATIC CLOUD SYNC -----------------

function emitHistorySyncEvent(userId?: string | null, syncedCount = 0, pendingCount = 0) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('calcmax:history-sync-updated', {
      detail: { userId: userId || null, syncedCount, pendingCount },
    })
  );
}

function triggerCalculationBackgroundSync() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => {
      const syncMgr = (reg as unknown as { sync?: { register: (tag: string) => Promise<void> } }).sync;
      if (syncMgr && typeof syncMgr.register === 'function') {
        return syncMgr.register('calcmax-offline-sync').catch(() => {});
      }
    })
    .catch(() => {});
}

export function getCalculationOfflineSyncQueue(userId?: string | null): CalculationOfflineSyncOp[] {
  if (typeof window === 'undefined') return [];
  try {
    const key = `${CALC_SYNC_OUTBOX_PREFIX}${userId || 'local_guest'}`;
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCalculationOfflineSyncQueue(
  queue: CalculationOfflineSyncOp[],
  userId?: string | null
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `${CALC_SYNC_OUTBOX_PREFIX}${userId || 'local_guest'}`;
    localStorage.setItem(key, JSON.stringify(queue));
  } catch {
    // Ignore quota notices
  }
}

export function getPendingCalculationSyncCount(userId?: string | null): number {
  const queue = getCalculationOfflineSyncQueue(userId);
  const localHistory = getCalculationHistory(userId);
  const unsyncedItems = localHistory.filter(
    (item) => item.syncStatus === 'local' || item.syncStatus === 'error'
  );

  const keys = new Set<string>(queue.map((q) => q.opKey));
  unsyncedItems.forEach((item) => keys.add(`upsert_calculation:${item.id}`));
  return keys.size;
}

export function enqueueCalculationOfflineSync(
  op: Omit<CalculationOfflineSyncOp, 'updatedAt'>,
  userId?: string | null
): void {
  if (typeof window === 'undefined' || !userId) return;
  const existing = getCalculationOfflineSyncQueue(userId);
  const fullOp: CalculationOfflineSyncOp = {
    ...op,
    updatedAt: new Date().toISOString(),
  };

  // Coalesce operations cleanly (e.g. deletion removes earlier pending upsert for same item)
  let nextQueue = existing.filter((existingOp) => existingOp.opKey !== fullOp.opKey);
  if (fullOp.type === 'delete_calculation') {
    const targetId = fullOp.deletePayload?.id || fullOp.deletePayload?.dbId?.toString();
    if (targetId) {
      nextQueue = nextQueue.filter(
        (existingOp) =>
          existingOp.opKey !== `upsert_calculation:${targetId}` &&
          existingOp.item?.id !== targetId &&
          existingOp.item?.dbId?.toString() !== targetId
      );
    }
  }

  nextQueue.push(fullOp);
  saveCalculationOfflineSyncQueue(nextQueue, userId);
  triggerCalculationBackgroundSync();
  emitHistorySyncEvent(userId, 0, nextQueue.length);
}

export function clearCalculationOfflineOp(opKey: string, userId?: string | null): void {
  if (typeof window === 'undefined' || !userId) return;
  const existing = getCalculationOfflineSyncQueue(userId);
  const next = existing.filter((op) => op.opKey !== opKey);
  if (next.length !== existing.length) {
    saveCalculationOfflineSyncQueue(next, userId);
    emitHistorySyncEvent(userId, 0, next.length);
  }
}

/**
 * Attempts to sync an individual calculation item to the cloud database (Supabase direct + API route fallback).
 */
export async function syncSingleCalculationToCloud(
  item: HistoryItem,
  userId: string
): Promise<{ success: boolean; dbId?: string | number | null }> {
  // 1. Direct Supabase insert
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('calculations')
      .insert({
        user_id: userId,
        type: item.type,
        details: item.details,
        result: item.result,
      })
      .select('id')
      .single();

    if (!error && data?.id) {
      return { success: true, dbId: data.id };
    }
  } catch (err) {
    // Continue to server API fallback
  }

  // 2. Server API route fallback
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    const res = await fetch('/api/calculations', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: item.type,
        details: item.details,
        result: item.result,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.calculation?.id) {
        return { success: true, dbId: data.calculation.id };
      }
      return { success: true, dbId: `cloud-${Date.now()}` };
    }
  } catch (err) {
    // Network or server unreachable
  }

  return { success: false, dbId: null };
}

/**
 * Flushes all pending calculation operations and unsynced local history items to the cloud database.
 * Thread-safe and debounced via user-keyed in-flight promise map.
 */
export async function flushOfflineCalculationsQueue(
  userId?: string | null
): Promise<{ syncedCount: number; pendingCount: number }> {
  if (!userId || typeof window === 'undefined') {
    return { syncedCount: 0, pendingCount: getPendingCalculationSyncCount(userId) };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { syncedCount: 0, pendingCount: getPendingCalculationSyncCount(userId) };
  }

  if (inFlightCalcSyncByUser.has(userId)) {
    return inFlightCalcSyncByUser.get(userId)!;
  }

  const syncPromise = (async () => {
    let syncedCount = 0;
    const queue = getCalculationOfflineSyncQueue(userId);
    const localHistory = getCalculationHistory(userId);

    // 1. Process pending offline deletions first
    const deleteOps = queue.filter((op) => op.type === 'delete_calculation');
    for (const delOp of deleteOps) {
      const payload = delOp.deletePayload;
      if (!payload) {
        clearCalculationOfflineOp(delOp.opKey, userId);
        continue;
      }
      try {
        const supabase = createClient();
        if (payload.all) {
          await supabase.from('calculations').delete().eq('user_id', userId);
        } else if (payload.dbId) {
          await supabase.from('calculations').delete().eq('user_id', userId).eq('id', payload.dbId);
        } else if (payload.details && payload.result) {
          await supabase
            .from('calculations')
            .delete()
            .eq('user_id', userId)
            .eq('details', payload.details)
            .eq('result', payload.result);
        }
        clearCalculationOfflineOp(delOp.opKey, userId);
      } catch {
        // Retain in queue if delete failed due to network
      }
    }

    // 2. Identify all local calculation items that require cloud sync
    const itemsNeedingSync = localHistory.filter(
      (item) => item.syncStatus === 'local' || item.syncStatus === 'error' || !item.dbId
    );

    let hasLocalUpdates = false;
    const updatedHistory = [...localHistory];

    for (const item of itemsNeedingSync) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) break;

      const res = await syncSingleCalculationToCloud(item, userId);
      const targetIdx = updatedHistory.findIndex((h) => h.id === item.id);

      if (res.success && targetIdx !== -1) {
        updatedHistory[targetIdx] = {
          ...updatedHistory[targetIdx],
          dbId: res.dbId || updatedHistory[targetIdx].dbId || `cloud-${Date.now()}`,
          syncStatus: 'synced',
        };
        clearCalculationOfflineOp(`upsert_calculation:${item.id}`, userId);
        syncedCount++;
        hasLocalUpdates = true;
      } else if (!res.success && targetIdx !== -1) {
        updatedHistory[targetIdx] = {
          ...updatedHistory[targetIdx],
          syncStatus: navigator.onLine ? 'error' : 'local',
        };
        hasLocalUpdates = true;
      }
    }

    if (hasLocalUpdates) {
      setCalculationHistory(updatedHistory, userId);
    }

    const remainingPending = getPendingCalculationSyncCount(userId);
    emitHistorySyncEvent(userId, syncedCount, remainingPending);

    return { syncedCount, pendingCount: remainingPending };
  })().finally(() => {
    inFlightCalcSyncByUser.delete(userId);
  });

  inFlightCalcSyncByUser.set(userId, syncPromise);
  return syncPromise;
}



