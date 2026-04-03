// Steo Élite - Service Worker
// Version: 5.0.0 - Filter finished matches

const CACHE_NAME = 'steo-elite-v5';
const STATIC_CACHE = 'steo-static-v5';
const DYNAMIC_CACHE = 'steo-dynamic-v5';
const OFFLINE_URL = '/offline.html';

// Force version check
const REQUIRED_VERSION = '20260323-v5';

// Resources to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/offline.html',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW v5] Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW v5] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW v5] Installed - forcing activation');
        return self.skipWaiting();
      })
  );
});

// Activate event - CLEAN ALL OLD CACHES IMMEDIATELY
self.addEventListener('activate', (event) => {
  console.log('[SW v5] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        // Delete ALL caches that don't match current version
        return Promise.all(
          cacheNames.map((name) => {
            if (name !== STATIC_CACHE && name !== DYNAMIC_CACHE) {
              console.log('[SW v5] DELETING old cache:', name);
              return caches.delete(name);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW v5] Activated - all old caches cleared');
        // Take control of all pages immediately
        return self.clients.claim();
      })
      .then(() => {
        // Notify all clients to reload
        return self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ 
              type: 'FORCE_RELOAD',
              version: REQUIRED_VERSION 
            });
          });
        });
      })
  );
});

// Fetch event - Network First for HTML, Cache First for static
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin
  if (url.origin !== location.origin) return;

  // API - Network First, no cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(() => new Response(JSON.stringify({ error: 'Offline' }), {
          headers: { 'Content-Type': 'application/json' }
        }))
    );
    return;
  }

  // Static assets with hash - Cache First
  if (url.pathname.includes('_next/static/')) {
    event.respondWith(
      caches.match(request)
        .then((cached) => cached || fetch(request).then((r) => {
          const clone = r.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(request, clone));
          return r;
        }))
    );
    return;
  }

  // Navigation - Network First with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache for offline
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(request)
            .then((cached) => cached || caches.match(OFFLINE_URL));
        })
    );
    return;
  }

  // Other - try network, fallback to cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// Message handler
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_ALL_CACHES') {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
});
