'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import {
  dismissNotification,
  isOfflineSyncNotificationSuppressed,
  showNotification,
} from '@/lib/notifications';
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
  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  const runCloudSync = useCallback(async (uid: string | null) => {
    if (!uid || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return;
    }
    const beforePending = calculateAllPendingCount(uid);
    const shouldNotifySync = beforePending > 0 && !isOfflineSyncNotificationSuppressed();
    if (shouldNotifySync) {
      showNotification({
        id: 'cloud-sync',
        message: `Syncing ${beforePending} offline item${beforePending === 1 ? '' : 's'}...`,
        type: 'sync',
        duration: 0,
      });
    }
    try {
      const [notesTasksRes, calcRes] = await Promise.allSettled([
        flushOfflineSyncQueue(uid),
        flushOfflineCalculationsQueue(uid),
      ]);
      const notesSynced = notesTasksRes.status === 'fulfilled' ? notesTasksRes.value.syncedCount : 0;
      const calcSynced = calcRes.status === 'fulfilled' ? calcRes.value.syncedCount : 0;

      const totalSynced = notesSynced + calcSynced;

      if (totalSynced > 0 && !isOfflineSyncNotificationSuppressed()) {
        showNotification({
          id: 'cloud-sync',
          message: `Synced ${totalSynced} offline item${totalSynced === 1 ? '' : 's'}`,
          type: 'success',
          duration: 3000,
        });
      } else if (shouldNotifySync) {
        dismissNotification('cloud-sync');
      }
    } catch {
      if (shouldNotifySync) {
        dismissNotification('cloud-sync');
      }
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
        void syncRemindersToDeviceStore(getLocalNotes(resolved), getLocalTasks(resolved));
      })
      .catch(() => {
        if (!mounted) return;
        const fallback = readCachedUserId();
        setActiveUserId(fallback);
        void syncRemindersToDeviceStore(getLocalNotes(fallback), getLocalTasks(fallback));
      });

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const uid = session?.user?.id || readCachedUserId();
      setActiveUserId(uid);
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

    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
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

  return null;
}
