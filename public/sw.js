const CACHE_NAME = 'calculator-max-pwa-v4';
const PUSH_DB_NAME = 'calcMaxPushDB';
const PUSH_DB_VERSION = 1;
const REMINDERS_STORE = 'reminders';

const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/manifest.json',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
];

const OFFLINE_SHELL_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Calculator Max • Offline</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f8fafc; color: #0f172a; padding: 24px; }
    .card { max-width: 360px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 24px; text-align: center; box-shadow: 0 10px 30px rgba(15,23,42,0.06); }
    h1 { font-size: 18px; margin: 0 0 8px; }
    p { font-size: 14px; color: #475569; margin: 0 0 16px; line-height: 1.5; }
    button { background: #2563eb; color: #fff; border: 0; border-radius: 12px; padding: 10px 18px; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Calculator Max</h1>
    <p>You are currently offline. Reconnect or tap Retry to reload the cached workspace.</p>
    <button onclick="window.location.reload()">Retry</button>
  </div>
</body>
</html>`;

const scheduledTimeouts = new Map();

function openRemindersDB() {
  return new Promise((resolve) => {
    try {
      const req = self.indexedDB.open(PUSH_DB_NAME, PUSH_DB_VERSION);
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

async function readRemindersFromDB() {
  const db = await openRemindersDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(REMINDERS_STORE, 'readonly');
      const store = tx.objectStore(REMINDERS_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        db.close();
        resolve(req.result || []);
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
}

async function writeRemindersToDB(reminders) {
  const db = await openRemindersDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(REMINDERS_STORE, 'readwrite');
      const store = tx.objectStore(REMINDERS_STORE);
      reminders.forEach((rem) => store.put(rem));
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

async function fireReminderNotificationInSW(rem) {
  const options = {
    body: rem.body || 'Scheduled Calculator Max reminder',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: `calcmax-rem-${rem.id}-${new Date(rem.remindAt).getTime()}`,
    renotify: true,
    requireInteraction: Boolean(rem.isEmergency),
    vibrate: rem.isEmergency ? [220, 100, 220, 100, 320] : [160, 80, 160],
    data: {
      url: rem.sourceType === 'task' ? '/?tab=tasks' : '/?tab=notes',
      sourceType: rem.sourceType,
      sourceId: rem.sourceId,
    },
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  try {
    await self.registration.showNotification(rem.title || 'Calculator Max Reminder', options);
  } catch {
    // Ignore if notification permission revoked
  }
}

async function checkAndScheduleRemindersInSW() {
  if (!self.registration || typeof self.registration.showNotification !== 'function') {
    return;
  }

  // Clear stale timers and reschedule cleanly
  scheduledTimeouts.forEach((timerId) => clearTimeout(timerId));
  scheduledTimeouts.clear();

  const reminders = await readRemindersFromDB();
  const now = Date.now();
  const updatedToSave = [];

  for (const rem of reminders) {
    if (!rem || !rem.remindAt) continue;
    const dueMs = new Date(rem.remindAt).getTime();
    if (Number.isNaN(dueMs)) continue;
    if (rem.firedAt === rem.remindAt) continue;

    const delta = dueMs - now;

    // Due now or arrived while offline/suspended (up to 24h catch-up)
    if (delta <= 1500 && now - dueMs <= 86400000) {
      rem.firedAt = rem.remindAt;
      updatedToSave.push(rem);
      await fireReminderNotificationInSW(rem);
    } else if (delta > 1500 && delta <= 2147483647) {
      // Attempt native Notification Trigger if browser supports TimestampTrigger
      if (typeof self.TimestampTrigger === 'function') {
        try {
          await self.registration.showNotification(rem.title || 'Calculator Max Reminder', {
            body: rem.body || 'Scheduled reminder',
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: `calcmax-trig-${rem.id}-${dueMs}`,
            showTrigger: new self.TimestampTrigger(dueMs),
            data: {
              url: rem.sourceType === 'task' ? '/?tab=tasks' : '/?tab=notes',
            },
          });
        } catch {
          // Fall through to timer-based scheduling below
        }
      }

      // Schedule in-worker timer while SW stays alive
      if (delta <= 24 * 60 * 60 * 1000) {
        const timerId = setTimeout(async () => {
          scheduledTimeouts.delete(rem.id);
          const freshList = await readRemindersFromDB();
          const current = freshList.find((r) => r.id === rem.id);
          if (current && current.remindAt === rem.remindAt && current.firedAt !== current.remindAt) {
            current.firedAt = current.remindAt;
            await writeRemindersToDB([current]);
            await fireReminderNotificationInSW(current);
          }
        }, delta);
        scheduledTimeouts.set(rem.id, timerId);
      }
    }
  }

  if (updatedToSave.length > 0) {
    await writeRemindersToDB(updatedToSave);
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(new Request(url, { cache: 'reload' }));
            if (response && response.status === 200) {
              await cache.put(url, response.clone());
            }
          } catch {
            // Skip unreachable URLs during background install
          }
        })
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((oldKey) => caches.delete(oldKey))
        )
      ),
      checkAndScheduleRemindersInSW(),
    ])
  );
});

self.addEventListener('message', (event) => {
  const payload = event.data;
  if (!payload || typeof payload !== 'object') return;

  if (payload.type === 'SYNC_REMINDERS' && Array.isArray(payload.reminders)) {
    event.waitUntil(
      openRemindersDB().then(async (db) => {
        if (db) {
          await new Promise((resolve) => {
            try {
              const tx = db.transaction(REMINDERS_STORE, 'readwrite');
              const store = tx.objectStore(REMINDERS_STORE);
              store.clear();
              payload.reminders.forEach((rem) => store.put(rem));
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
        await checkAndScheduleRemindersInSW();
      })
    );
  } else if (payload.type === 'CHECK_REMINDERS') {
    event.waitUntil(checkAndScheduleRemindersInSW());
  } else if (payload.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Real Web Push event handler (background/closed-app notifications when push payload arrives)
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Calculator Max Reminder',
    body: 'You have a scheduled note or task reminder.',
    url: '/',
    isEmergency: false,
    tag: `calcmax-push-${Date.now()}`,
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch {
      const text = event.data.text();
      if (text) payload.body = text;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: payload.tag,
      renotify: true,
      requireInteraction: Boolean(payload.isEmergency),
      vibrate: payload.isEmergency ? [220, 100, 220, 100, 320] : [160, 80, 160],
      data: { url: payload.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'CALCMAX_OPEN_REMINDER_TARGET', url: targetUrl });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Background Sync: notifies active clients to replay offline queue & checks reminders
self.addEventListener('sync', (event) => {
  if (event.tag === 'calcmax-offline-sync') {
    event.waitUntil(
      Promise.all([
        checkAndScheduleRemindersInSW(),
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'CALCMAX_TRIGGER_OFFLINE_SYNC' });
          });
        }),
      ])
    );
  } else if (event.tag === 'calcmax-reminder-check') {
    event.waitUntil(checkAndScheduleRemindersInSW());
  }
});

// Periodic Background Sync: checks scheduled reminders even when offline / idle
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'calcmax-reminder-periodic') {
    event.waitUntil(checkAndScheduleRemindersInSW());
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept or cache API, auth, or dev HMR routes
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.includes('webpack-hmr') ||
    url.pathname.includes('hot-update')
  ) {
    return;
  }

  // Manifest files: always Network-First so updates apply immediately without stale metadata
  if (url.pathname === '/manifest.webmanifest' || url.pathname === '/manifest.json') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || Response.error();
        })
    );
    return;
  }

  // Network-first for HTML page navigations with guaranteed offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedPage = await caches.match(request, { ignoreSearch: true });
          if (cachedPage) return cachedPage;
          const cachedRoot = await caches.match('/', { ignoreSearch: true });
          if (cachedRoot) return cachedRoot;
          return new Response(OFFLINE_SHELL_HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        })
    );
    return;
  }

  // Network-first for JS/CSS and Next.js bundles with offline cache fallback
  const isCodeBundle =
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:js|css)$/i.test(url.pathname);

  if (isCodeBundle) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          return cachedResponse || Response.error();
        })
    );
    return;
  }

  // Stale-while-revalidate for icons, images, and fonts (never returns undefined)
  const isMediaOrFont = /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(url.pathname);

  if (isMediaOrFont) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        const networkPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse || Response.error());

        return cachedResponse || networkPromise;
      })
    );
  }
});
