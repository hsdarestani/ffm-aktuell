/* Minimal PWA service worker. Never cache authenticated data or APIs. */
self.addEventListener('install',event=>{self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim())});

self.addEventListener('push',event=>{
 let data;try{data=event.data.json()}catch{return}
 const url=new URL(data.url||'/',self.location.origin);
 if(url.origin!==self.location.origin)return;
 event.waitUntil(self.registration.showNotification(String(data.title||'FFM Aktuell').slice(0,200),{
  body:String(data.body||'').slice(0,300),icon:'/icon.svg',tag:String(data.tag||'ffm'),data:{url:url.href}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const url=new URL(event.notification.data?.url||'/',self.location.origin);
 if(url.origin!==self.location.origin)return;
 event.waitUntil(self.clients.openWindow(url.href));
});
