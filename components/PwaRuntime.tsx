'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Check, RefreshCw, WifiOff, X } from 'lucide-react';
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
  requestNotificationPermission,
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
  const [showFirstLaunchPushPrompt, setShowFirstLaunchPushPrompt] = useState<boolean>(false);

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

  // First-launch push notification permission configuration & gesture-attached prompt
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const FIRST_LAUNCH_KEY = 'calcmax_push_first_launch_done';
    const alreadyHandled = localStorage.getItem(FIRST_LAUNCH_KEY);

    if (!alreadyHandled) {
      if (Notification.permission === 'default') {
        setShowFirstLaunchPushPrompt(true);

        const requestOnFirstTouch = async () => {
          window.removeEventListener('pointerdown', requestOnFirstTouch);
          try {
            const perm = await requestNotificationPermission(activeUserId);
            if (perm === 'granted') {
              await subscribeToWebPushIfConfigured(activeUserId);
            }
            localStorage.setItem(FIRST_LAUNCH_KEY, 'true');
            setShowFirstLaunchPushPrompt(false);
          } catch {}
        };
        window.addEventListener('pointerdown', requestOnFirstTouch, { once: true });
      } else {
        localStorage.setItem(FIRST_LAUNCH_KEY, 'true');
        if (Notification.permission === 'granted') {
          void subscribeToWebPushIfConfigured(activeUserId);
        }
      }
    } else if (Notification.permission === 'granted') {
      void subscribeToWebPushIfConfigured(activeUserId);
    }
  }, [activeUserId]);

  const handleEnablePushFirstLaunch = async () => {
    try {
      const perm = await requestNotificationPermission(activeUserId);
      if (perm === 'granted') {
        await subscribeToWebPushIfConfigured(activeUserId);
        setSyncedBannerText('Push notifications enabled for reminders!');
        setTimeout(() => setSyncedBannerText(null), 3200);
      }
    } finally {
      localStorage.setItem('calcmax_push_first_launch_done', 'true');
      setShowFirstLaunchPushPrompt(false);
    }
  };

  const handleDismissPushFirstLaunch = () => {
    localStorage.setItem('calcmax_push_first_launch_done', 'true');
    setShowFirstLaunchPushPrompt(false);
  };

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
      {/* First-launch push notification request banner */}
      {showFirstLaunchPushPrompt && (
        <div
          role="dialog"
          aria-labelledby="push-prompt-title"
          className="fixed top-3 left-3 right-3 sm:left-auto sm:right-4 sm:w-96 z-50 bg-white/95 backdrop-blur-md rounded-2xl p-3.5 border border-indigo-200/90 shadow-2xl space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-300"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 text-indigo-600 mt-0.5">
                <Bell className="w-4 h-4" />
              </span>
              <div>
                <h4 id="push-prompt-title" className="text-xs font-black text-slate-900 tracking-tight uppercase">
                  Enable Push Notifications
                </h4>
                <p className="text-[11px] font-medium text-slate-600 mt-0.5 leading-snug">
                  Get scheduled reminders for tasks, notes, and alerts even when offline or the app is closed.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismissPushFirstLaunch}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              aria-label="Dismiss notification prompt"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleDismissPushFirstLaunch}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Maybe Later
            </button>
            <button
              type="button"
              onClick={handleEnablePushFirstLaunch}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Enable Alerts</span>
            </button>
          </div>
        </div>
      )}

      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 sm:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg border border-amber-500"
        >
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>
            {pendingCount > 0
              ? `Offline Mode — ${pendingCount} change${pendingCount === 1 ? '' : 's'} queued`
              : 'Offline Mode — Saved locally'}
          </span>
        </div>
      )}

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
