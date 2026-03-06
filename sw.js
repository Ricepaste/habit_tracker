const CACHE_NAME = 'habitflow-v2'; // Incrementing version triggers update
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap'
];

// Install: Cache immediately and skip waiting
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force active immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching new assets');
      return cache.addAll(ASSETS);
    })
  );
});

// Activate: Clean up old caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys
        .filter(key => key !== CACHE_NAME)
        .map(key => {
          console.log('Removing old cache:', key);
          return caches.delete(key);
        })
      );
    })
  );
  return self.clients.claim(); // Take control of all pages immediately
});

// Fetch: Stale-While-Revalidate Strategy
// This allows the app to load instantly from cache, 
// but updates the cache in the background for the NEXT visit.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((response) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          // Update the cache with the newest version
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // If network fails, it's okay, we served the cached version
        });
        
        // Return the cached response immediately if it exists, otherwise wait for network
        return response || fetchPromise;
      });
    })
  );
});
