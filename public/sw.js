const CACHE_PREFIX = 'calculator-max-pwa-v7';
let activeCacheName = CACHE_PREFIX;
let activeDeploymentVersion = 'v7';

const PUSH_DB_NAME = 'calcMaxPushDB';
const PUSH_DB_VERSION = 1;
const REMINDERS_STORE = 'reminders';
const META_STORE = 'sw_meta';

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

const DYNAMIC_SWR_API_PATHS = [
  '/api/calculations',
  '/api/storage',
  '/api/backup-settings',
];

const OFFLINE_SHELL_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Calculator Max • Offline</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; min-height: 100dvh; display: flex; flex-direction: column; justify-content: space-between; align-items: center; background: #f8fafc; color: #0f172a; padding: 32px 24px; box-sizing: border-box; }
    .spacer { height: 24px; }
    .card { max-width: 360px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 24px; text-align: center; box-shadow: 0 10px 30px rgba(15,23,42,0.06); }
    h1 { font-size: 18px; margin: 0 0 8px; }
    p { font-size: 14px; color: #475569; margin: 0 0 16px; line-height: 1.5; }
    button { background: #2563eb; color: #fff; border: 0; border-radius: 12px; padding: 10px 18px; font-weight: 600; cursor: pointer; }
    .brand-footer { text-align: center; padding-bottom: 8px; }
    .brand-name { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: #0f172a; margin: 0; }
  </style>
</head>
<body>
  <div class="spacer"></div>
  <div class="card">
    <h1>Offline Mode Ready</h1>
    <p>You are currently offline. Reconnect or tap Retry to reload the cached workspace.</p>
    <button onclick="window.location.reload()">Retry</button>
  </div>
  <div class="brand-footer">
    <p class="brand-name">Calculator Max</p>
  </div>
</body>
</html>`;

const scheduledTimeouts = new Map();

function openRemindersDB() {
  return new Promise((resolve) => {
    try {
      const req = self.indexedDB.open(PUSH_DB_NAME, PUSH_DB_VERSION + 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(REMINDERS_STORE)) {
          db.createObjectStore(REMINDERS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readMetaValue(key) {
  const db = await openRemindersDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(META_STORE, 'readonly');
      const store = tx.objectStore(META_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        db.close();
        resolve(req.result ? req.result.value : null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function writeMetaValue(key, value) {
  const db = await openRemindersDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(META_STORE, 'readwrite');
      const store = tx.objectStore(META_STORE);
      store.put({ key, value });
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

async function hydrateSavedCacheVersion() {
  const savedVersion = await readMetaValue('deploymentVersion');
  if (savedVersion && typeof savedVersion === 'string') {
    activeDeploymentVersion = savedVersion;
    activeCacheName = `${CACHE_PREFIX}-${savedVersion}`;
  }
}

function extractStaticAssetUrlsFromHtml(htmlText) {
  if (!htmlText || typeof htmlText !== 'string') return [];
  const discovered = new Set();
  const assetRegex = /(?:href|src)=["'](\/_next\/static\/[^"'?#\\\s]+)["']/gi;
  for (const match of htmlText.matchAll(assetRegex)) {
    const candidate = match[1];
    if (
      candidate &&
      !candidate.includes('/webpack/') &&
      /\.(?:js|css|woff2?)$/i.test(candidate)
    ) {
      discovered.add(candidate);
    }
  }
  return Array.from(discovered);
}

/**
 * Validates that a Response has a safe status and a Content-Type matching the Request expectation.
 * Prevents HTML error/fallback pages from ever being cached or served as JavaScript/CSS/JSON.
 */
function isValidResponseForRequest(request, url, response, isRscRequest = false) {
  if (!response || response.status !== 200) return false;
  if (response.type !== 'basic' && response.type !== 'cors') return false;

  const contentType = (response.headers.get('content-type') || '').toLowerCase();

  // Never allow HTML to be served for JS scripts (prevents Uncaught SyntaxError: Unexpected token '<')
  if (
    request.destination === 'script' ||
    /\.m?js$/i.test(url.pathname)
  ) {
    return (
      contentType.includes('javascript') ||
      contentType.includes('ecmascript')
    );
  }

  // Stylesheets must be text/css
  if (
    request.destination === 'style' ||
    /\.css$/i.test(url.pathname)
  ) {
    return contentType.includes('text/css');
  }

  // RSC flight requests must never be HTML documents
  if (isRscRequest) {
    return !contentType.includes('text/html');
  }

  // Page navigations must be text/html
  if (request.mode === 'navigate') {
    return contentType.includes('text/html');
  }

  // JSON / Manifest / API endpoints must return JSON or manifest content-type
  if (
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/manifest.json' ||
    /\.json$/i.test(url.pathname) ||
    DYNAMIC_SWR_API_PATHS.some((p) => url.pathname.startsWith(p))
  ) {
    return (
      contentType.includes('json') ||
      contentType.includes('manifest')
    );
  }

  // For images/fonts/icons, ensure it is not an HTML error page
  return !contentType.includes('text/html');
}

async function precacheCoreAssets(cacheName) {
  const cache = await caches.open(cacheName);
  let rootHtmlText = '';

  await Promise.allSettled(
    PRECACHE_URLS.map(async (urlPath) => {
      try {
        const req = new Request(urlPath, { cache: 'reload' });
        const response = await fetch(req);
        const parsedUrl = new URL(urlPath, self.location.origin);
        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (response && response.status === 200) {
          if (urlPath === '/' && contentType.includes('text/html')) {
            try {
              rootHtmlText = await response.clone().text();
            } catch {
              // Ignore text extraction error
            }
            await cache.put(urlPath, response.clone());
          } else if (urlPath !== '/' && !contentType.includes('text/html')) {
            await cache.put(urlPath, response.clone());
          }
        }
      } catch {
        // Ignore offline/unreachable URLs during background install
      }
    })
  );

  // Also precache core Next.js static JS/CSS/font bundles referenced by the root app shell
  if (rootHtmlText) {
    const bundleUrls = extractStaticAssetUrlsFromHtml(rootHtmlText);
    if (bundleUrls.length > 0) {
      await Promise.allSettled(
        bundleUrls.map(async (bundleUrl) => {
          try {
            const existing = await cache.match(bundleUrl);
            if (existing) return;
            const req = new Request(bundleUrl, { cache: 'force-cache' });
            const res = await fetch(req);
            const parsedUrl = new URL(bundleUrl, self.location.origin);
            if (isValidResponseForRequest(req, parsedUrl, res, false)) {
              await cache.put(bundleUrl, res.clone());
            }
          } catch {
            // Ignore individual chunk fetch failure
          }
        })
      );
    }
  }
}

async function purgeOutdatedCaches(keepCacheName) {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key !== keepCacheName)
      .map((oldKey) => caches.delete(oldKey))
  );
}

async function syncDeploymentVersionInSW(forceRefresh = false) {
  await hydrateSavedCacheVersion();
  try {
    const res = await fetch('/api/sw-version', {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res || !res.ok) return false;
    const data = await res.json();
    const serverVersion =
      data && typeof data.version === 'string' && data.version.trim()
        ? data.version.trim()
        : 'v7';
    const nextCacheName = `${CACHE_PREFIX}-${serverVersion}`;
    const versionChanged =
      serverVersion !== activeDeploymentVersion || activeCacheName !== nextCacheName;

    if (versionChanged || forceRefresh) {
      activeDeploymentVersion = serverVersion;
      activeCacheName = nextCacheName;
      await writeMetaValue('deploymentVersion', serverVersion);
      await precacheCoreAssets(nextCacheName);
      await purgeOutdatedCaches(nextCacheName);

      if (versionChanged) {
        const clients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        clients.forEach((client) => {
          client.postMessage({
            type: 'CALCMAX_SW_UPDATED',
            version: serverVersion,
            cacheName: nextCacheName,
          });
        });
      }
      return versionChanged;
    }
  } catch {
    // Offline or endpoint unreachable; keep using current activeCacheName
  }
  return false;
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
            current.firedAt = rem.remindAt;
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
    (async () => {
      const updatedByVersion = await syncDeploymentVersionInSW(true);
      if (!updatedByVersion) {
        await precacheCoreAssets(activeCacheName);
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await syncDeploymentVersionInSW(false);
      await purgeOutdatedCaches(activeCacheName);
      await checkAndScheduleRemindersInSW();

      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      clients.forEach((client) => {
        client.postMessage({
          type: 'CALCMAX_SW_ACTIVATED',
          version: activeDeploymentVersion,
          cacheName: activeCacheName,
        });
      });
    })()
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
  } else if (payload.type === 'CHECK_FOR_UPDATES') {
    event.waitUntil(syncDeploymentVersionInSW(Boolean(payload.forceRefresh)));
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

// Background Sync: notifies active clients to replay offline queue & checks reminders + SW updates
self.addEventListener('sync', (event) => {
  if (event.tag === 'calcmax-offline-sync') {
    event.waitUntil(
      Promise.all([
        syncDeploymentVersionInSW(false),
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

// Periodic Background Sync: checks scheduled reminders & deployment updates even when idle
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'calcmax-reminder-periodic') {
    event.waitUntil(
      Promise.all([
        syncDeploymentVersionInSW(false),
        checkAndScheduleRemindersInSW(),
      ])
    );
  }
});

/**
 * Stale-While-Revalidate helper:
 * Serves validated cached response immediately if present for instant loading on slow connections,
 * while concurrently fetching fresh content in the background and updating the active cache.
 */
function respondWithStaleWhileRevalidate(event, request, url, options = {}) {
  const {
    ignoreSearch = false,
    cacheRootAlias = false,
    navigationFallback = false,
    allowCors = false,
    isRscRequest = false,
  } = options;

  event.respondWith(
    (async () => {
      const cache = await caches.open(activeCacheName);
      let cachedResponse =
        (await cache.match(request, { ignoreSearch })) ||
        (await caches.match(request, { ignoreSearch }));

      if (
        cachedResponse &&
        !isValidResponseForRequest(request, url, cachedResponse, isRscRequest)
      ) {
        await cache.delete(request, { ignoreSearch }).catch(() => {});
        cachedResponse = null;
      }

      const revalidatePromise = (async () => {
        try {
          let networkResponse;
          if (allowCors || request.mode === 'navigate') {
            networkResponse = await fetch(request);
          } else {
            networkResponse = await fetch(new Request(request, { cache: 'no-cache' }));
          }

          if (
            networkResponse &&
            isValidResponseForRequest(request, url, networkResponse, isRscRequest)
          ) {
            await cache.put(request, networkResponse.clone());
            if (cacheRootAlias) {
              await cache.put('/', networkResponse.clone());
            }
          }
          return networkResponse;
        } catch {
          return null;
        }
      })();

      // Keep background revalidation alive even after returning cached response immediately
      event.waitUntil(revalidatePromise);

      if (cachedResponse) {
        return cachedResponse;
      }

      const freshResponse = await revalidatePromise;
      if (freshResponse) {
        return freshResponse;
      }

      if (navigationFallback) {
        const cachedRoot =
          (await cache.match('/')) ||
          (await caches.match('/'));
        if (
          cachedRoot &&
          isValidResponseForRequest(request, url, cachedRoot, false)
        ) {
          return cachedRoot;
        }

        return new Response(OFFLINE_SHELL_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      return Response.error();
    })()
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // If a mutating API request occurs (POST/PUT/DELETE/PATCH), invalidate cached GET data for that path
  if (request.method !== 'GET') {
    if (
      url.origin === self.location.origin &&
      DYNAMIC_SWR_API_PATHS.some((p) => url.pathname.startsWith(p))
    ) {
      event.waitUntil(
        caches.open(activeCacheName).then((cache) =>
          cache.delete(url.pathname, { ignoreSearch: true })
        )
      );
    }
    return;
  }

  // External live Currency Exchange Rate API: Stale-While-Revalidate for instant offline/slow-network FX rates
  if (
    url.origin !== self.location.origin &&
    url.hostname.includes('exchangerate-api.com')
  ) {
    respondWithStaleWhileRevalidate(event, request, url, {
      ignoreSearch: false,
      allowCors: true,
    });
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Never intercept or cache auth, sw-version check, or Next.js dev/HMR/webpack runtime routes
  if (
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/api/auth/') ||
    url.pathname === '/api/sw-version' ||
    url.pathname.startsWith('/_next/static/webpack/') ||
    url.pathname.startsWith('/__nextjs') ||
    url.pathname.includes('webpack-hmr') ||
    url.pathname.includes('hot-update')
  ) {
    return;
  }

  // Read-only dynamic API content (/api/calculations, /api/storage, /api/backup-settings): Stale-While-Revalidate
  if (DYNAMIC_SWR_API_PATHS.some((p) => url.pathname.startsWith(p))) {
    respondWithStaleWhileRevalidate(event, request, url, {
      ignoreSearch: false,
    });
    return;
  }

  // Other API routes (e.g. POST-only or non-cached endpoints): pass through
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Next.js App Router RSC flight & dynamic data requests: Stale-While-Revalidate
  const isRscRequest =
    request.headers.get('RSC') === '1' ||
    request.headers.get('Next-Router-Prefetch') === '1' ||
    url.searchParams.has('_rsc') ||
    url.pathname.startsWith('/_next/data/');

  if (isRscRequest) {
    respondWithStaleWhileRevalidate(event, request, url, {
      ignoreSearch: false,
      isRscRequest: true,
    });
    return;
  }

  // Manifest files: Stale-While-Revalidate so app metadata loads instantly and updates in background
  if (url.pathname === '/manifest.webmanifest' || url.pathname === '/manifest.json') {
    respondWithStaleWhileRevalidate(event, request, url, {
      ignoreSearch: true,
    });
    return;
  }

  // HTML page navigations: Stale-While-Revalidate for instant startup on slow connections + background cache update
  if (request.mode === 'navigate') {
    respondWithStaleWhileRevalidate(event, request, url, {
      ignoreSearch: false,
      cacheRootAlias: url.pathname === '/',
      navigationFallback: true,
    });
    return;
  }

  // JS/CSS, Next.js static bundles, icons, images, and fonts: Stale-While-Revalidate
  const isStaticOrMediaAsset =
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff2?|json)$/i.test(url.pathname);

  if (isStaticOrMediaAsset) {
    respondWithStaleWhileRevalidate(event, request, url, {
      ignoreSearch: false,
    });
    return;
  }

  // Default fallback for any other same-origin GET dynamic content: Stale-While-Revalidate
  respondWithStaleWhileRevalidate(event, request, url, {
    ignoreSearch: false,
  });
});
