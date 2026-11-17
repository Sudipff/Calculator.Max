'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import {
  isOfflineSyncNotificationSuppressed,
  showNotification,
} from '@/lib/notifications';
import {
  flushOfflineSyncQueue,
  getLocalNotes,
  getLocalTasks,
} from '@/lib/notesTasksStorage';
import {
  flushOfflineCalculationsQueue,
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

export default function PwaRuntime() {
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const hasReloadedForSwRef = useRef<boolean>(false);

  const runCloudSync = useCallback(async (uid: string | null) => {
    if (!uid || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return;
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
      }
    } catch {
      // Background sync will retry automatically on next trigger
    }
  }, []);

  const checkServiceWorkerUpdates = useCallback(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const reg = swRegistrationRef.current;
    if (reg) {
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      reg.update().catch(() => {});
    }
    navigator.serviceWorker.controller?.postMessage({ type: 'CHECK_FOR_UPDATES' });
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

  // Register Service Worker, handle updatefound/controllerchange lifecycle, and SW-to-Window sync messages
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let isMounted = true;
    const hadControllerInitially = Boolean(navigator.serviceWorker.controller);

    const promptWaitingWorker = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.postMessage({ type: 'SKIP_WAITING' });
    };

    const registerSW = () => {
      if (!isMounted) return;
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((reg) => {
          if (!isMounted) return;
          swRegistrationRef.current = reg;

          if (reg.waiting) {
            promptWaitingWorker(reg.waiting);
          }

          reg.addEventListener('updatefound', () => {
            const installingWorker = reg.installing;
            if (!installingWorker) return;
            installingWorker.addEventListener('statechange', () => {
              if (
                installingWorker.state === 'installed' &&
                navigator.serviceWorker.controller
              ) {
                promptWaitingWorker(reg.waiting || installingWorker);
              }
            });
          });

          reg.update().catch(() => {});
          reg.active?.postMessage({ type: 'CHECK_FOR_UPDATES' });

          // Attempt periodic reminder & update check registration (Chromium PWAs)
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

    const handleControllerChange = () => {
      if (!hadControllerInitially || hasReloadedForSwRef.current) return;
      hasReloadedForSwRef.current = true;
      window.location.reload();
    };

    const handleSwMessage = (event: MessageEvent) => {
      const msgType = event.data?.type;
      if (msgType === 'CALCMAX_TRIGGER_OFFLINE_SYNC') {
        void runCloudSync(activeUserId || readCachedUserId());
      } else if (msgType === 'CALCMAX_SW_UPDATED' || msgType === 'CALCMAX_SW_ACTIVATED') {
        const incomingVersion =
          typeof event.data?.version === 'string' ? event.data.version : null;
        if (!incomingVersion) return;
        try {
          const prevVersion = localStorage.getItem('calcmax_sw_deployment_version');
          localStorage.setItem('calcmax_sw_deployment_version', incomingVersion);
          if (
            msgType === 'CALCMAX_SW_UPDATED' &&
            prevVersion &&
            prevVersion !== incomingVersion &&
            !hasReloadedForSwRef.current
          ) {
            hasReloadedForSwRef.current = true;
            window.location.reload();
          }
        } catch {
          // Ignore storage restrictions
        }
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    navigator.serviceWorker.addEventListener('message', handleSwMessage);

    // Periodically check for newly deployed service worker / cache version while app is open
    const updateCheckInterval = setInterval(() => {
      checkServiceWorkerUpdates();
    }, 5 * 60 * 1000);

    return () => {
      isMounted = false;
      clearInterval(updateCheckInterval);
      window.removeEventListener('load', registerSW);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    };
  }, [activeUserId, checkServiceWorkerUpdates, runCloudSync]);

  // Automatic Offline-to-Cloud Sync & SW Update Check on reconnect, focus, and visibility restore
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const uid = activeUserId || readCachedUserId();

    if (navigator.onLine && uid) {
      void runCloudSync(uid);
    }

    const handleOnline = () => {
      checkServiceWorkerUpdates();
      const targetUid = activeUserId || readCachedUserId();
      if (targetUid) {
        void runCloudSync(targetUid);
      }
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        checkServiceWorkerUpdates();
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
      window.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [activeUserId, checkServiceWorkerUpdates, runCloudSync]);

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
