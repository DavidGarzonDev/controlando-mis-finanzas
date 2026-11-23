/* Pilas · service worker: solo para mostrar notificaciones (no guarda páginas en caché). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = { titulo: 'Pilas', cuerpo: '', url: '/' };
  try { d = { ...d, ...e.data.json() }; } catch { if (e.data) d.cuerpo = e.data.text(); }
  e.waitUntil(
    self.registration.showNotification(d.titulo, {
      body: d.cuerpo,
      icon: '/logo-192.png',
      badge: '/logo-192.png',
      tag: d.etiqueta || undefined,
      data: { url: d.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) if (v.url.startsWith(self.location.origin)) return v.navigate(url).then((w) => w && w.focus());
      return self.clients.openWindow(url);
    }),
  );
});
