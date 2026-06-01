/**
 * LawnPro Service Worker
 *
 * Strategy:
 *  - /_next/static/*  → Cache-First (hashed immutable assets, safe to cache forever)
 *  - /icons/*         → Cache-First (rarely change)
 *  - /manifest.json   → Network-First (needs to stay fresh for updates)
 *  - /offline.html    → Pre-cached at install
 *  - All other GET    → Network-First, offline fallback to /offline.html
 *  - Non-GET / API    → Network Only (never cache mutations or Supabase calls)
 */

const CACHE_VERSION = 'v1'
const STATIC_CACHE  = `lawnpro-static-${CACHE_VERSION}`
const PAGES_CACHE   = `lawnpro-pages-${CACHE_VERSION}`

// Files to pre-cache on install
const PRECACHE_URLS = [
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
]

// ─── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      // Use individual adds so one failure doesn't block all
      return Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
    })
  )
  // Activate immediately — don't wait for old tabs to close
  self.skipWaiting()
})

// ─── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== PAGES_CACHE)
          .map((key) => {
            console.log('[SW] Deleting old cache:', key)
            return caches.delete(key)
          })
      )
    )
  )
  // Take control of all clients immediately
  self.clients.claim()
})

// ─── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin requests (not Supabase API calls)
  if (url.origin !== self.location.origin) return

  // Only cache GET requests
  if (request.method !== 'GET') return

  // /_next/static/ — Cache-First (these are content-hashed, safe forever)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }

  // /icons/ — Cache-First
  if (url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }

  // /offline.html — always serve from cache if available
  if (url.pathname === '/offline.html') {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }

  // Everything else (pages, _next/data, etc.) — Network-First
  event.respondWith(networkFirst(request))
})

// ─── Strategies ─────────────────────────────────────────────────────────────

/**
 * Cache-First: serve from cache, fall back to network (and update cache).
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch {
    // If we can't fetch and have no cache, return a generic error
    return new Response('Resource unavailable offline', { status: 503 })
  }
}

/**
 * Network-First: try network, cache success, fall back to offline page on failure.
 */
async function networkFirst(request) {
  const cache = await caches.open(PAGES_CACHE)

  try {
    const response = await fetch(request)
    if (response.ok) {
      // Only cache navigation requests (HTML pages) and _next/data JSON
      const contentType = response.headers.get('content-type') || ''
      const isHtml = contentType.includes('text/html')
      const isNextData = request.url.includes('/_next/data/')
      if (isHtml || isNextData) {
        cache.put(request, response.clone())
      }
    }
    return response
  } catch {
    // Network failed — try stale page cache
    const cached = await cache.match(request)
    if (cached) return cached

    // For navigation requests, show offline page
    if (request.mode === 'navigate') {
      const offlineCache = await caches.open(STATIC_CACHE)
      const offlinePage = await offlineCache.match('/offline.html')
      if (offlinePage) return offlinePage
    }

    return new Response('Offline', { status: 503 })
  }
}

// ─── Message Handler ────────────────────────────────────────────────────────
// Allows the app to tell a waiting SW to activate immediately
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// ─── Background Sync / Push (future) ────────────────────────────────────────
// Placeholder for future push notification support
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  self.registration.showNotification(data.title || 'LawnPro', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    data: data.url ? { url: data.url } : undefined,
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.notification.data?.url) {
    event.waitUntil(clients.openWindow(event.notification.data.url))
  }
})
