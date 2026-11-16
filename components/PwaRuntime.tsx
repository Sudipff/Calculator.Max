'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw, WifiOff } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import {
  flushOfflineSyncQueue,
  getLocalNotes,
  getLocalTasks,
  getPendingSyncCount,
} from '@/lib/notesTasksStorage';
import {
  flushOfflineCalculationsQueue,
  getPendingCalculationSyncCount,
} from '@/lib/historyStorage';
import {
  checkAndFireDueReminders,
  subscribeToWebPushIfConfigured,
  syncRemindersToDeviceStore,
} from '@/lib/reminderService';

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export function OfflineWifiIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label="Offline — no internet connection"
      title="Offline — Saved locally"
      data-testid="offline-wifi-indicator"
      className="w-8 h-8 rounded-full bg-rose-50 border border-rose-200/90 text-red-500 flex items-center justify-center shadow-2xs shrink-0"
    >
      <WifiOff className="w-4 h-4 stroke-[2.25]" />
    </span>
  );
}

function readCachedUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('retail_calc_auth_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.id || null;
  } catch {
    return null;
  }
}

function calculateAllPendingCount(uid?: string | null): number {
  return getPendingSyncCount(uid) + getPendingCalculationSyncCount(uid);
}

export default function PwaRuntime() {
  const isOnline = useOnlineStatus();
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncingQueue, setIsSyncingQueue] = useState<boolean>(false);
  const [syncedBannerText, setSyncedBannerText] = useState<string | null>(null);

  const runCloudSync = useCallback(async (uid: string | null) => {
    if (!uid || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      setPendingCount(calculateAllPendingCount(uid));
      return;
    }
    const beforePending = calculateAllPendingCount(uid);
    if (beforePending > 0) {
      setIsSyncingQueue(true);
    }
    try {
      const [notesTasksRes, calcRes] = await Promise.allSettled([
        flushOfflineSyncQueue(uid),
        flushOfflineCalculationsQueue(uid),
      ]);
      const notesSynced = notesTasksRes.status === 'fulfilled' ? notesTasksRes.value.syncedCount : 0;
      const notesPending = notesTasksRes.status === 'fulfilled' ? notesTasksRes.value.pendingCount : getPendingSyncCount(uid);
      const calcSynced = calcRes.status === 'fulfilled' ? calcRes.value.syncedCount : 0;
      const calcPending = calcRes.status === 'fulfilled' ? calcRes.value.pendingCount : getPendingCalculationSyncCount(uid);

      const totalSynced = notesSynced + calcSynced;
      const totalPending = notesPending + calcPending;
      setPendingCount(totalPending);

      if (totalSynced > 0) {
        setSyncedBannerText(`Synced ${totalSynced} offline item${totalSynced === 1 ? '' : 's'}`);
        setTimeout(() => setSyncedBannerText(null), 3200);
      }
    } finally {
      setIsSyncingQueue(false);
    }
  }, []);

  // Resolve user session cleanly & subscribe to auth state updates
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let mounted = true;
    const cachedId = readCachedUserId();
    if (cachedId) {
      setActiveUserId(cachedId);
    }

    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!mounted) return;
        const resolved = data?.user?.id || readCachedUserId();
        setActiveUserId(resolved);
        setPendingCount(calculateAllPendingCount(resolved));
        void syncRemindersToDeviceStore(getLocalNotes(resolved), getLocalTasks(resolved));
      })
      .catch(() => {
        if (!mounted) return;
        const fallback = readCachedUserId();
        setActiveUserId(fallback);
        setPendingCount(calculateAllPendingCount(fallback));
        void syncRemindersToDeviceStore(getLocalNotes(fallback), getLocalTasks(fallback));
      });

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const uid = session?.user?.id || readCachedUserId();
      setActiveUserId(uid);
      setPendingCount(calculateAllPendingCount(uid));
      void syncRemindersToDeviceStore(getLocalNotes(uid), getLocalTasks(uid));
      if (uid && navigator.onLine) {
        void runCloudSync(uid);
      }
    });

    return () => {
      mounted = false;
      authSub?.subscription?.unsubscribe();
    };
  }, [runCloudSync]);

  // Silently refresh Web Push subscription only if user has already granted notification permission
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      void subscribeToWebPushIfConfigured(activeUserId);
    }
  }, [activeUserId]);

  // Register Service Worker, Periodic Reminder Sync, and SW-to-Window sync messages
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let isMounted = true;
    const registerSW = () => {
      if (!isMounted) return;
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((reg) => {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          reg.update().catch(() => {});
          // Attempt periodic reminder check registration (Chromium PWAs)
          const periodic = (reg as unknown as {
            periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> };
          }).periodicSync;
          if (periodic && typeof periodic.register === 'function') {
            periodic.register('calcmax-reminder-periodic', { minInterval: 15 * 60 * 1000 }).catch(() => {});
          }
          // Refresh Web Push subscription silently if permission already granted
          void subscribeToWebPushIfConfigured(activeUserId);
        })
        .catch(() => {
          // Graceful no-op if SW registration is blocked by preview restrictions
        });
    };

    registerSW();

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'CALCMAX_TRIGGER_OFFLINE_SYNC') {
        void runCloudSync(activeUserId || readCachedUserId());
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSwMessage);

    return () => {
      isMounted = false;
      window.removeEventListener('load', registerSW);
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    };
  }, [activeUserId, runCloudSync]);

  // Automatic Offline-to-Cloud Sync on reconnect, focus, visibility restore, and local sync events
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const uid = activeUserId || readCachedUserId();
    setPendingCount(calculateAllPendingCount(uid));

    if (navigator.onLine && uid) {
      void runCloudSync(uid);
    }

    const handleOnline = () => {
      const targetUid = activeUserId || readCachedUserId();
      if (targetUid) {
        void runCloudSync(targetUid);
      }
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        const targetUid = activeUserId || readCachedUserId();
        void syncRemindersToDeviceStore(getLocalNotes(targetUid), getLocalTasks(targetUid));
        void checkAndFireDueReminders();
        if (navigator.onLine && targetUid) {
          void runCloudSync(targetUid);
        }
      }
    };

    const handleSyncUpdated = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (typeof detail?.pendingCount === 'number') {
        setPendingCount(calculateAllPendingCount(activeUserId || readCachedUserId()));
      } else {
        setPendingCount(calculateAllPendingCount(activeUserId || readCachedUserId()));
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('calcmax:sync-updated', handleSyncUpdated);
    window.addEventListener('calcmax:history-sync-updated', handleSyncUpdated);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('calcmax:sync-updated', handleSyncUpdated);
      window.removeEventListener('calcmax:history-sync-updated', handleSyncUpdated);
    };
  }, [activeUserId, runCloudSync]);

  // Global cross-tab scheduled reminder monitor & offline catch-up checker
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const uid = activeUserId || readCachedUserId();
    void syncRemindersToDeviceStore(getLocalNotes(uid), getLocalTasks(uid)).then(() => {
      void checkAndFireDueReminders();
    });

    const interval = setInterval(() => {
      void checkAndFireDueReminders();
    }, 15000);

    return () => clearInterval(interval);
  }, [activeUserId]);

  return (
    <>

      {isOnline && isSyncingQueue && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 sm:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg border border-blue-500"
        >
          <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />
          <span>
            Syncing {pendingCount > 0 ? pendingCount : ''} offline item{pendingCount === 1 ? '' : 's'}...
          </span>
        </div>
      )}

      {isOnline && syncedBannerText && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 sm:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg border border-emerald-500"
        >
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>{syncedBannerText}</span>
        </div>
      )}
    </>
  );
}
