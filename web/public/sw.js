// Service Worker: Offline-Hülle und Push. Daten (Supabase) werden nie zwischengespeichert.
const CACHE = "zentrale-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./manifest.webmanifest", "./icons/icon.svg"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (e.request.mode === "navigate") {
    // Seite: erst Netz, offline die letzte Fassung
    e.respondWith(fetch(e.request).then((r) => {
      const kopie = r.clone();
      caches.open(CACHE).then((c) => c.put("./", kopie));
      return r;
    }).catch(() => caches.match("./")));
    return;
  }
  // Dateien mit Hash im Namen, Schrift, Symbole: aus dem Speicher
  e.respondWith(caches.match(e.request).then((treffer) => treffer || fetch(e.request).then((r) => {
    if (r.ok) {
      const kopie = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, kopie));
    }
    return r;
  })));
});

self.addEventListener("push", (e) => {
  let m = { titel: "Zentrale", text: "", ziel: "#/" };
  try { m = { ...m, ...e.data.json() }; } catch { if (e.data) m.text = e.data.text(); }
  e.waitUntil(self.registration.showNotification(m.titel, {
    body: m.text,
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    data: { ziel: m.ziel },
    tag: m.ziel,
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const ziel = new URL("./" + (e.notification.data?.ziel || "#/"), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenster) => {
    for (const f of fenster) {
      if ("focus" in f) { f.navigate(ziel); return f.focus(); }
    }
    return self.clients.openWindow(ziel);
  }));
});
