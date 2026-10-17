/* Minimal PWA service worker. Never cache authenticated data or APIs. */
self.addEventListener('install',event=>{self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim())});
