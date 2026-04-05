// This is a minimal service worker required for PWA installation criteria
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Installed');
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  console.log('[Service Worker] Activated');
});

// A fetch listener is strictly required by Chrome to pass the PWA criteria
self.addEventListener('fetch', (e) => {
  // Do nothing, just act as a pass-through
});
