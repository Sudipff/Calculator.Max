/**
 * Unified Push Notification & Offline Reminder Scheduling Service
 * - Uses Web Audio API for synthetic chimes when foregrounded
 * - Requests Notification permission explicitly & manages Web Push subscriptions when available
 * - Persists scheduled note & task reminders into IndexedDB (`calcMaxPushDB`) and syncs with Service Worker (`/sw.js`)
 *   so scheduled alerts are delivered as Service Worker push notifications even when offline.
 */

import type { NoteItem, TaskItem } from './types/notes-tasks';

export interface ScheduledReminderRecord {
  id: string;
  sourceType: 'note' | 'task';
  sourceId: string;
  title: string;
  body: string;
  remindAt: string;
  isEmergency: boolean;
  firedAt?: string | null;
}

const PUSH_DB_NAME = 'calcMaxPushDB';
const PUSH_DB_VERSION = 1;
const REMINDERS_STORE = 'reminders';
const FIRED_CACHE_KEY = 'retailcalc_fired_reminders_v1';

let audioContext: AudioContext | null = null;

export function playReminderChime(isEmergency = false) {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    if (!audioContext || audioContext.state === 'suspended') {
      audioContext = new AudioCtx();
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }

    const now = audioContext.currentTime;

    if (isEmergency) {
      [0, 0.2, 0.4].forEach((delay, i) => {
        const osc = audioContext!.createOscillator();
        const gain = audioContext!.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880 + i * 150, now + delay);

        gain.gain.setValueAtTime(0.2, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.15);

        osc.connect(gain);
        gain.connect(audioContext!.destination);

        osc.start(now + delay);
        osc.stop(now + delay + 0.16);
      });
    } else {
      const freqs = [587.33, 880];
      freqs.forEach((freq, idx) => {
        const osc = audioContext!.createOscillator();
        const gain = audioContext!.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.18);

        gain.gain.setValueAtTime(0.25, now + idx * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 0.7);

        osc.connect(gain);
        gain.connect(audioContext!.destination);

        osc.start(now + idx * 0.18);
        osc.stop(now + idx * 0.18 + 0.75);
      });
    }
  } catch (e) {
    console.warn('Audio chime notice:', e);
  }
}

function getFiredMap(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(FIRED_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function markReminderFiredLocally(id: string, remindAt: string) {
  if (typeof window === 'undefined') return;
  try {
    const map = getFiredMap();
    map[id] = remindAt;
    const keys = Object.keys(map);
    if (keys.length > 200) {
      keys.slice(0, keys.length - 150).forEach((k) => delete map[k]);
    }
    localStorage.setItem(FIRED_CACHE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota notice
  }
}

function openPushDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(PUSH_DB_NAME, PUSH_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(REMINDERS_STORE)) {
          db.createObjectStore(REMINDERS_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToWebPushIfConfigured(userId?: string | null): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    Notification.permission !== 'granted'
  ) {
    return false;
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      const appServerKey = urlBase64ToUint8Array(vapidPublicKey);
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey.buffer as ArrayBuffer,
      });
    }

    if (subscription && userId && navigator.onLine) {
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify(subscription.toJSON()),
      }).catch(() => {});
    }
    return Boolean(subscription);
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(userId?: string | null): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  try {
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm === 'granted') {
      void subscribeToWebPushIfConfigured(userId);
    }
    return perm;
  } catch {
    return Notification.permission;
  }
}

/**
 * Dispatches an OS-level push notification via the active Service Worker registration
 * so notifications work offline, in background tabs, and across Android/Desktop PWAs.
 */
export async function sendServiceWorkerPushNotification(
  title: string,
  options?: NotificationOptions & { url?: string; isEmergency?: boolean }
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  const isEmergency = Boolean(options?.isEmergency);
  const notifOptions: NotificationOptions & Record<string, any> = {
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: isEmergency ? [220, 100, 220, 100, 320] : [160, 80, 160],
    requireInteraction: isEmergency,
    renotify: Boolean(options?.tag),
    tag: options?.tag || `calcmax-${Date.now()}`,
    data: {
      url: options?.url || '/',
      ...(options?.data || {}),
    },
    ...options,
  };

  if ('serviceWorker' in navigator) {
    try {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
      ]);
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, notifOptions);
        return true;
      }
    } catch {
      // Fallback to window Notification below
    }
  }

  try {
    const notif = new Notification(title, notifOptions);
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
    return true;
  } catch {
    return false;
  }
}

// Preserve legacy function signature while routing through Service Worker push first
export function sendDeviceNotification(
  title: string,
  options?: NotificationOptions & { url?: string; isEmergency?: boolean }
) {
  void sendServiceWorkerPushNotification(title, options);
  return null;
}

/**
 * Collects all scheduled reminders from Notes & Tasks, stores them in IndexedDB (`calcMaxPushDB`),
 * and notifies the active Service Worker so it schedules offline push delivery.
 */
export async function syncRemindersToDeviceStore(notes: NoteItem[], tasks: TaskItem[]): Promise<void> {
  if (typeof window === 'undefined') return;

  const firedMap = getFiredMap();
  const records: ScheduledReminderRecord[] = [];

  for (const n of notes || []) {
    if (!n?.id || !n.reminderAt) continue;
    const ms = new Date(n.reminderAt).getTime();
    if (Number.isNaN(ms)) continue;
    const recId = `note:${n.id}`;
    const alreadyFiredForTimestamp = firedMap[recId] === n.reminderAt;
    records.push({
      id: recId,
      sourceType: 'note',
      sourceId: n.id,
      title: `${n.isEmergency ? 'URGENT Note Alert: ' : 'Note Reminder: '}${n.title || 'Untitled Note'}`,
      body: n.content?.trim() || `${n.checklistItems?.length || 0} checklist items due`,
      remindAt: n.reminderAt,
      isEmergency: Boolean(n.isEmergency),
      firedAt: alreadyFiredForTimestamp ? n.reminderAt : null,
    });
  }

  for (const t of tasks || []) {
    if (!t?.id || t.completed) continue;
    const targetIso = t.reminderAt || t.dueDate;
    if (!targetIso) continue;
    const ms = new Date(targetIso).getTime();
    if (Number.isNaN(ms)) continue;
    const recId = `task:${t.id}`;
    const alreadyFiredForTimestamp = firedMap[recId] === targetIso;
    records.push({
      id: recId,
      sourceType: 'task',
      sourceId: t.id,
      title: `Task Due: ${t.title}`,
      body: t.description?.trim() || 'Your scheduled task reminder is due.',
      remindAt: targetIso,
      isEmergency: t.priority === 'high' || Boolean(t.isStarred),
      firedAt: alreadyFiredForTimestamp ? targetIso : null,
    });
  }

  const db = await openPushDB();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(REMINDERS_STORE, 'readwrite');
        const store = tx.objectStore(REMINDERS_STORE);
        const existingReq = store.getAll();
        existingReq.onsuccess = () => {
          const existingList = (existingReq.result || []) as ScheduledReminderRecord[];
          const existingFiredById = new Map<string, string>();
          existingList.forEach((item) => {
            if (item.firedAt && item.firedAt === item.remindAt) {
              existingFiredById.set(item.id, item.firedAt);
            }
          });

          store.clear();
          records.forEach((rec) => {
            const firedPrev = existingFiredById.get(rec.id);
            const mergedRec: ScheduledReminderRecord = {
              ...rec,
              firedAt: rec.firedAt || (firedPrev === rec.remindAt ? firedPrev : null),
            };
            store.put(mergedRec);
          });
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      } catch {
        db.close();
        resolve();
      }
    });
  }

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const targetWorker = navigator.serviceWorker.controller || reg.active;
      targetWorker?.postMessage({
        type: 'SYNC_REMINDERS',
        reminders: records,
      });
    } catch {
      // Ignore if SW is not active yet
    }
  }
}

/**
 * Global foreground + offline catch-up checker: checks IndexedDB reminders regardless of active tab,
 * plays audio chime + fires OS push notification via Service Worker if any reminder is due.
 */
export async function checkAndFireDueReminders(): Promise<ScheduledReminderRecord[]> {
  if (typeof window === 'undefined') return [];

  const alertsDisabled = localStorage.getItem('retailcalc_tasks_alerts_enabled') === 'false';
  const db = await openPushDB();
  if (!db) return [];

  const allReminders = await new Promise<ScheduledReminderRecord[]>((resolve) => {
    try {
      const tx = db.transaction(REMINDERS_STORE, 'readonly');
      const store = tx.objectStore(REMINDERS_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        db.close();
        resolve((req.result || []) as ScheduledReminderRecord[]);
      };
      req.onerror = () => {
        db.close();
        resolve([]);
      };
    } catch {
      db.close();
      resolve([]);
    }
  });

  const now = Date.now();
  const newlyFired: ScheduledReminderRecord[] = [];
  const firedMap = getFiredMap();

  for (const rem of allReminders) {
    if (rem.sourceType === 'task' && alertsDisabled) continue;
    const dueMs = new Date(rem.remindAt).getTime();
    if (Number.isNaN(dueMs)) continue;

    // Due window: arrived up to 24 hours ago (for offline catch-up) and not yet fired for this exact timestamp
    const isDue = dueMs <= now && now - dueMs <= 86_400_000;
    const alreadyFired = rem.firedAt === rem.remindAt || firedMap[rem.id] === rem.remindAt;

    if (isDue && !alreadyFired) {
      markReminderFiredLocally(rem.id, rem.remindAt);
      newlyFired.push(rem);

      playReminderChime(rem.isEmergency);
      await sendServiceWorkerPushNotification(rem.title, {
        body: rem.body,
        tag: `calcmax-rem-${rem.id}-${dueMs}`,
        isEmergency: rem.isEmergency,
        url: rem.sourceType === 'task' ? '/?tab=tasks' : '/?tab=notes',
      });
    }
  }

  if (newlyFired.length > 0) {
    const dbWrite = await openPushDB();
    if (dbWrite) {
      await new Promise<void>((resolve) => {
        try {
          const tx = dbWrite.transaction(REMINDERS_STORE, 'readwrite');
          const store = tx.objectStore(REMINDERS_STORE);
          newlyFired.forEach((rem) => {
            store.put({ ...rem, firedAt: rem.remindAt });
          });
          tx.oncomplete = () => {
            dbWrite.close();
            resolve();
          };
          tx.onerror = () => {
            dbWrite.close();
            resolve();
          };
        } catch {
          dbWrite.close();
          resolve();
        }
      });
    }
  }

  return newlyFired;
}
