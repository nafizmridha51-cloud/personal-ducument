const CACHE_NAME = 'secure-doc-vault-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
];

// Install Event - Pre-cache the main offline shells
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline shell');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old caches if any
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Handle asset requests with Network-First, falling back to cache
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Only intercept GET requests
  if (request.method !== 'GET') {
    return;
  }

  // 2. Exclude Firestore database requests, Firebase Auth endpoints, internal WebSockets/HMR
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.pathname.includes('/api/') ||
    url.pathname.includes('hmr') ||
    url.pathname.includes('vite') ||
    url.pathname.includes('ws') ||
    url.port === '3001'
  ) {
    return;
  }

  // 3. For pages, scripts, styles, and fonts, use Network-First, falling back to Cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Only cache successful standard, CORS, or select opaque responses (like Google Fonts)
        if (
          response && 
          response.status === 200 && 
          (response.type === 'basic' || response.type === 'cors' || (response.type === 'opaque' && url.hostname.includes('fonts.gstatic.com')))
        ) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Network request failed (offline) -> try Cache
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If it's a page navigation request, return index.html shell
          if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/');
          }
        });
      })
  );
});
