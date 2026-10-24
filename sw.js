// Service worker: prostředník mezi aplikací a serverem v Macu.
// Strategie „nejdřív síť“: vždy zkusí čerstvá data z Macu a uloží si kopii.
// Když se s Macem spojit nejde (bez signálu, Mac spí), vrátí poslední kopii –
// aplikace se tak otevře a ukáže, co bylo naposledy načtené.
// Ukládání zápisů (/api/…) jde vždy jen přes síť – kopii zápisů drží js/zapisy.js.

const MEZIPAMET = "dashboard-v1";

self.addEventListener("install", () => self.skipWaiting()); // nová verze hned
self.addEventListener("activate", (udalost) => {
  // Staré verze mezipaměti smazat a převzít otevřené stránky
  udalost.waitUntil(
    caches.keys()
      .then((nazvy) => Promise.all(nazvy.filter((n) => n !== MEZIPAMET).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (udalost) => {
  const pozadavek = udalost.request;
  const adresa = new URL(pozadavek.url);
  // Jen naše stránky a data, jen čtení. Cizí weby (počasí) a /api necháváme být.
  if (pozadavek.method !== "GET" || adresa.origin !== location.origin || adresa.pathname.startsWith("/api/")) return;
  udalost.respondWith(nejdrivSit(pozadavek));
});

async function nejdrivSit(pozadavek) {
  try {
    const odpoved = await fetch(pozadavek);
    // Ukládáme jen normální úspěšné odpovědi – ne přesměrování na přihlášení ani chyby
    if (odpoved.ok && !odpoved.redirected && odpoved.type === "basic") {
      const kopie = odpoved.clone();
      caches.open(MEZIPAMET).then((mezipamet) => mezipamet.put(pozadavek, kopie));
    }
    return odpoved;
  } catch {
    // Síť nefunguje → poslední kopie (u stránek i bez ?v=…, kdyby se verze mezitím změnila)
    const kopie = (await caches.match(pozadavek)) || (await caches.match(pozadavek, { ignoreSearch: true }));
    if (kopie) return kopie;
    return new Response("Mac je teď nedostupný a tahle stránka ještě nebyla uložená.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
