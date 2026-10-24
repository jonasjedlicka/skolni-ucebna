// Dřívější service worker (offline režim pro iPhone) už není potřeba – dashboard
// běží jen na Macu, kde je server pořád po ruce. Tahle verze jen smaže uložené
// kopie stránek a sama se odregistruje, aby nic nezůstalo.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (udalost) => {
  udalost.waitUntil(
    caches.keys()
      .then((nazvy) => Promise.all(nazvy.map((n) => caches.delete(n))))
      .then(() => self.registration.unregister())
  );
});
