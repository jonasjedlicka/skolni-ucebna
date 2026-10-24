// Společné funkce, které používají všechny stránky a všechny moduly.
// Tenhle soubor se musí na stránce načíst jako první (před moduly).

// Seznam modulů dashboardu. Každý soubor v js/moduly/ sem přidá jeden záznam:
// { id, zalozka, maxStariHodin, dnes: [{ nazev, poradi, vysoka, vykresli(obsah, nadpis) }] }
// Přehled (index.html) pak posbírá dlaždice „dnes“ ze všech modulů.
const MODULY = [];

// --- Navigace a ikony ---

// SVG ikona podle názvu z IKONY (js/zalozky.js)
function vytvorIkonu(nazev) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "ikona");
  svg.setAttribute("aria-hidden", "true"); // čtečky obrazovky přečtou text vedle ikony
  const cesta = document.createElementNS("http://www.w3.org/2000/svg", "path");
  cesta.setAttribute("d", IKONY[nazev]);
  svg.append(cesta);
  return svg;
}

// Vykreslí navigaci ze seznamu ZALOZKY do <nav id="navigace">.
// Která záložka je aktivní, říká <body data-zalozka="…">.
function vykresliNavigaci() {
  const nav = document.getElementById("navigace");
  if (!nav) return;
  const aktivni = document.body.dataset.zalozka;
  for (const zalozka of ZALOZKY) {
    const odkaz = vytvor("a", "zalozka");
    odkaz.href = zalozka.odkaz;
    odkaz.append(vytvorIkonu(zalozka.ikona), vytvor("span", "", zalozka.nazev));
    if (zalozka.id === aktivni) {
      odkaz.setAttribute("aria-current", "page");
    }
    nav.append(odkaz);
  }
}

// --- Přepínač částí záložky (např. Škola: Rozvrh | Testy | Předměty) ---
// V HTML: <div class="prepinac"> s tlačítky data-cast="rozvrh" a k nim
// <section id="cast-rozvrh">. Vybraná část je i v adrese (skola.html#testy),
// takže funguje tlačítko Zpět i odkaz z Přehledu rovnou na konkrétní část.
function nastavPrepinac() {
  const tlacitka = [...document.querySelectorAll(".prepinac button")];
  const casti = tlacitka.map((t) => t.dataset.cast);

  // animovat = false při načtení stránky: tam už běží animace přechodu mezi
  // záložkami a druhou animaci by prohlížeč i se změnou zahodil.
  function ukaz(cast, animovat = true) {
    if (!casti.includes(cast)) cast = casti[0];
    const prepni = () => {
      for (const nazev of casti) {
        document.getElementById("cast-" + nazev).hidden = nazev !== cast;
      }
      for (const tlacitko of tlacitka) {
        tlacitko.setAttribute("aria-selected", tlacitko.dataset.cast === cast);
      }
      // Na úzkém telefonu se přepínač posouvá – vybranou část posuneme do záběru
      tlacitka.find((t) => t.dataset.cast === cast)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    // View Transitions: prohlížeč plynule prolne starý a nový obsah.
    // Kde ji prohlížeč neumí, část se přepne hned (bez animace).
    if (animovat && document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Při rychlém přepnutí prohlížeč animaci přeskočí a ohlásí to jako chybu – nevadí
      document.startViewTransition(prepni).ready.catch(() => {});
    } else {
      prepni();
    }
  }

  for (const tlacitko of tlacitka) {
    tlacitko.addEventListener("click", () => {
      history.replaceState(null, "", "#" + tlacitko.dataset.cast); // zapíše část do adresy
      ukaz(tlacitko.dataset.cast);
    });
  }
  window.addEventListener("hashchange", () => ukaz(location.hash.slice(1)));
  ukaz(location.hash.slice(1), false);
}

// Text „aktualizováno před 3 h“ podle data/<id>/stav.json.
// Když jsou data starší než maxHodin, stahování se nejspíš zaseklo – dáme to najevo.
async function zobrazStav(prvek, id, maxHodin) {
  try {
    const { aktualizovano } = await nactiJson(`data/${id}/stav.json`);
    prvek.textContent = "aktualizováno " + textPredKolika(aktualizovano);
    if ((Date.now() - new Date(aktualizovano)) / 3600000 > maxHodin) {
      prvek.classList.add("zastarale");
      prvek.textContent += " – zastaralé";
      prvek.title = "Data se dlouho neaktualizovala. Zkontroluj stahovací skript.";
    }
  } catch {
    prvek.textContent = "";
  }
}

// Načte jeden JSON soubor a vrátí jeho obsah jako JavaScriptový objekt.
// "async" znamená, že funkce chvíli čeká (na odpověď serveru);
// "await" je místo, kde se čeká.
async function stahniJson(cesta) {
  // no-cache: prohlížeč se vždy zeptá serveru, jestli nemá novější verzi
  // (když ne, server odpoví krátce „beze změny“ a použije se uložená)
  const odpoved = await fetch(cesta, { cache: "no-cache" });
  overPrihlaseni(odpoved);
  if (!odpoved.ok) {
    throw new Error(`Nepodařilo se načíst ${cesta} (chyba ${odpoved.status})`);
  }
  return odpoved.json();
}

// Server odpověděl „nejsi přihlášený“ (přihlášení vypršelo) → na přihlašovací
// stránku; po přihlášení se vrátíme sem
function overPrihlaseni(odpoved) {
  if (odpoved.status === 401 && new URL(odpoved.url).origin === location.origin) {
    location.href = "/prihlaseni.html?dalsi=" + encodeURIComponent(location.pathname + location.search + location.hash);
    throw new Error("Přihlášení vypršelo.");
  }
}

// Mezipaměť: když stejný soubor chce víc karet (např. rozvrh dlaždice „Dnes“
// i karta Škola), stáhne se jen jednou a ostatní dostanou stejný výsledek.
const nactene = new Map();

function nactiJson(cesta) {
  if (!nactene.has(cesta)) {
    const slib = stahniJson(cesta);
    nactene.set(cesta, slib);
    slib.catch(() => nactene.delete(cesta)); // po chybě to příště zkusíme znovu
  }
  return nactene.get(cesta);
}

// Zapomene načtené soubory začínající danými cestami – příští nactiJson
// je stáhne znovu (používá aktualizace dat v js/obnova.js)
function zapomenNactene(predpony) {
  for (const cesta of [...nactene.keys()]) {
    if (predpony.some((predpona) => cesta.startsWith(predpona))) nactene.delete(cesta);
  }
}

// Vytvoří HTML prvek, např. vytvor("div", "karta", "Ahoj")
// → <div class="karta">Ahoj</div>.
// Text vkládáme přes textContent, takže se nikdy nespustí jako kód.
function vytvor(znacka, trida, text) {
  const prvek = document.createElement(znacka);
  if (trida) prvek.className = trida;
  if (text !== undefined) prvek.textContent = text;
  return prvek;
}

// --- Ukládání v prohlížeči (Soustředění, Odpočty…) ---
// Data zůstanou jen v tomhle prohlížeči na tomhle zařízení.
// localStorage umí jen text, proto objekt převádíme na JSON a zpět.
// try/catch: v anonymním okně nebo s vypnutým úložištěm čtení selže.
function nactiZProhlizece(klic, vychozi) {
  try {
    const text = localStorage.getItem(klic);
    return text ? { ...vychozi, ...JSON.parse(text) } : { ...vychozi };
  } catch {
    return { ...vychozi };
  }
}

function ulozDoProhlizece(klic, hodnota) {
  try {
    localStorage.setItem(klic, JSON.stringify(hodnota));
  } catch {
    // Nejde uložit (anonymní okno) – data vydrží aspoň do zavření stránky
  }
}

// Převede text "2026-11-02" na datum.
// Nepoužíváme new Date("2026-11-02"), protože to prohlížeč bere
// jako půlnoc v Londýně (UTC), a u nás by to pak mohl být jiný den.
function parsujDatum(text) {
  const [rok, mesic, den] = text.split("-").map(Number);
  return new Date(rok, mesic - 1, den); // měsíce se v JS počítají od 0!
}

// Dnešní datum jako "2026-10-23" v místním čase (švédský formát je přesně tenhle)
function datumKlic(datum = new Date()) {
  return datum.toLocaleDateString("sv-SE");
}

// Den v týdnu: 0 = pondělí … 6 = neděle (getDay() má 0 = neděle)
function denVTydnu(datum) {
  return (datum.getDay() + 6) % 7;
}

// Kolik dní zbývá od dneška do zadaného data (dnes = 0, zítra = 1, včera = -1).
function dnyDo(datum) {
  const dnes = new Date();
  dnes.setHours(0, 0, 0, 0); // vynulujeme čas, porovnáváme jen dny
  const MS_ZA_DEN = 24 * 60 * 60 * 1000;
  return Math.round((datum - dnes) / MS_ZA_DEN);
}

// Hezký text pro počet dní: „dnes“, „zítra“, „za 2 dny“, „za 5 dní“.
function textZaKolik(dny) {
  if (dny === 0) return "dnes";
  if (dny === 1) return "zítra";
  if (dny <= 4) return `za ${dny} dny`; // čeština: za 2, 3, 4 dny
  return `za ${dny} dní`;               // ale za 5 dní
}

// Jak dávno se něco stalo: „před chvílí“, „před 3 h“, „před 2 dny“.
// Dostane čas jako text ve formátu ISO, např. "2026-10-23T09:36:00".
function textPredKolika(isoCas) {
  const minut = Math.round((Date.now() - new Date(isoCas)) / 60000);
  if (minut < 1) return "před chvílí";
  if (minut < 60) return `před ${minut} min`;
  const hodin = Math.round(minut / 60);
  if (hodin < 24) return `před ${hodin} h`;
  const dni = Math.round(hodin / 24);
  return dni === 1 ? "včera" : `před ${dni} dny`;
}

document.addEventListener("DOMContentLoaded", () => {
  vykresliNavigaci();

  // <p data-stav="skola" data-max-hodin="48"> → „aktualizováno před 3 h“
  for (const prvek of document.querySelectorAll("[data-stav]")) {
    zobrazStav(prvek, prvek.dataset.stav, Number(prvek.dataset.maxHodin));
  }

  // Odkaz „zpět“ (např. z detailu předmětu do Školy) dostane šipku
  document.getElementById("zpet")?.prepend(vytvorIkonu("zpet"));

  // Tlačítko „Odhlásit“ v patičce: zruší přihlášení tohoto zařízení na serveru
  const odhlasit = document.getElementById("odhlasit");
  if (odhlasit) {
    odhlasit.prepend(vytvorIkonu("zamek"));
    odhlasit.addEventListener("click", async () => {
      await fetch("/api/odhlaseni", { method: "POST" });
      // Po odhlášení smazat i uložené kopie stránek a dat v tomhle zařízení
      if (window.caches) for (const nazev of await caches.keys()) await caches.delete(nazev);
      location.href = "/prihlaseni.html";
    });
  }

  // Dřívější service worker (offline režim pro iPhone) odregistrovat – dashboard
  // běží jen na Macu a stará kopie by mohla ukazovat zastaralá data
  navigator.serviceWorker?.getRegistrations().then((registrace) => registrace.forEach((r) => r.unregister()));
});

// Povolíme jen běžné webové adresy (http, https) a soubory z našeho webu.
// Adresa typu "javascript:…" by po kliknutí spustila kód, tu nepustíme.
// Důležité hlavně u dat z cizích zdrojů (Edookit, RSS).
function bezpecnaAdresa(adresa) {
  if (!adresa) return null;
  try {
    const url = new URL(adresa, location.href);
    if (url.protocol === "http:" || url.protocol === "https:") return adresa;
  } catch {
    // new URL vyhodí chybu, když adresa nedává smysl
  }
  return null;
}

// Když se něco pokazí, vypíše chybu přímo na stránku,
// abys hned viděl, co je špatně (a ne jen prázdnou stránku).
function ukazChybu(kontejner, chyba) {
  kontejner.replaceChildren(vytvor("p", "chyba", "Chyba: " + chyba.message));
  console.error(chyba);
}
