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
  const odpoved = await fetch(cesta);
  if (!odpoved.ok) {
    throw new Error(`Nepodařilo se načíst ${cesta} (chyba ${odpoved.status})`);
  }
  return odpoved.json();
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
  if (minut < 5) return "před chvílí";
  if (minut < 60) return `před ${minut} min`;
  const hodin = Math.round(minut / 60);
  if (hodin < 24) return `před ${hodin} h`;
  const dni = Math.round(hodin / 24);
  return dni === 1 ? "včera" : `před ${dni} dny`;
}

// --- Šifrovaná data ---
// Osobní data jsou na GitHubu zašifrovaná (*.enc.json, viz stahovani/sifrovani.py).
// Tady je rozšifrujeme. Klíč se počítá z hesla úplně stejně jako v Pythonu:
// PBKDF2-SHA256(heslo, sůl z data/sifra.json) → klíč pro AES-256-GCM.

const KLIC_V_PROHLIZECI = "ucebna-klic";
let cekaniNaKlic = null; // všechny karty čekají na stejné zadání hesla

function zBase64(text) {
  return Uint8Array.from(atob(text), (znak) => znak.charCodeAt(0));
}

function doBase64(bajty) {
  // Po kouscích: String.fromCharCode(...pole) by u velkých dat (dlouhé poznámky) spadlo
  const pole = new Uint8Array(bajty);
  let text = "";
  for (let i = 0; i < pole.length; i += 0x8000) {
    text += String.fromCharCode(...pole.subarray(i, i + 0x8000));
  }
  return btoa(text);
}

async function klicZBajtu(bajty) {
  return crypto.subtle.importKey("raw", bajty, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function desifruj(obal, klic) {
  const text = await crypto.subtle.decrypt({ name: "AES-GCM", iv: zBase64(obal.iv) }, klic, zBase64(obal.data));
  return JSON.parse(new TextDecoder().decode(text));
}

// Opak desifruj – stejný formát jako zasifruj ve stahovani/sifrovani.py,
// takže soubor zašifrovaný v prohlížeči umí přečíst i Python a naopak.
async function sifruj(data, klic) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // pokaždé jiné
  const text = new TextEncoder().encode(JSON.stringify(data));
  const sifra = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, klic, text);
  return { v: 1, iv: doBase64(iv), data: doBase64(sifra) };
}

// Vrátí klíč, nebo null, když heslo nesedí (rozšifrování kontrolního souboru selže)
async function overKlic(bajty) {
  try {
    const klic = await klicZBajtu(bajty);
    await desifruj(await nactiJson("data/kontrola.enc.json"), klic);
    return klic;
  } catch {
    return null;
  }
}

async function klicZHesla(heslo) {
  const { sul, iterace } = await nactiJson("data/sifra.json");
  const zaklad = await crypto.subtle.importKey("raw", new TextEncoder().encode(heslo), "PBKDF2", false, ["deriveBits"]);
  // Tohle schválně chvíli trvá (600 000 opakování) – přesně kvůli tomu je hádání hesla pomalé
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: zBase64(sul), iterations: iterace }, zaklad, 256);
}

function ziskejKlic() {
  if (!cekaniNaKlic) cekaniNaKlic = nactiUlozenyKlic().then((klic) => klic || zeptejSeNaHeslo());
  return cekaniNaKlic;
}

async function nactiUlozenyKlic() {
  let ulozeny = null;
  try {
    ulozeny = localStorage.getItem(KLIC_V_PROHLIZECI);
  } catch {
    // v anonymním okně může být úložiště zakázané – pak se jen zeptáme na heslo
  }
  if (!ulozeny) return null;
  const klic = await overKlic(zBase64(ulozeny));
  if (!klic) zapomenKlic(); // heslo se mezitím změnilo
  return klic;
}

function zapomenKlic() {
  try {
    localStorage.removeItem(KLIC_V_PROHLIZECI);
  } catch {
    // nic, nebylo co mazat
  }
}

// Ukáže okno pro zadání hesla a počká, dokud nezadáš správné
function zeptejSeNaHeslo() {
  return new Promise((hotovo) => {
    const okno = vytvor("dialog", "zamek");
    const formular = vytvor("form", "");
    formular.method = "dialog";
    const nadpis = vytvor("h2", "zamek-nadpis");
    nadpis.append(vytvorIkonu("zamek"), "Odemknout dashboard");
    formular.append(nadpis);
    formular.append(vytvor("p", "slaby", "Osobní data jsou zašifrovaná. Zadej heslo."));

    const pole = vytvor("input", "");
    pole.type = "password";
    pole.autocomplete = "current-password";
    pole.required = true;

    const zapamatovat = vytvor("label", "zamek-zapamatovat");
    const zaskrtavatko = vytvor("input", "");
    zaskrtavatko.type = "checkbox";
    zaskrtavatko.checked = true;
    zapamatovat.append(zaskrtavatko, " Zapamatovat na tomhle zařízení");

    const zprava = vytvor("p", "chyba");
    const tlacitko = vytvor("button", "filtr vybrany", "Odemknout");
    formular.append(pole, zapamatovat, zprava, tlacitko);
    okno.append(formular);
    okno.addEventListener("cancel", (udalost) => udalost.preventDefault()); // Esc okno nezavře

    formular.addEventListener("submit", async (udalost) => {
      udalost.preventDefault();
      tlacitko.disabled = true;
      zprava.textContent = "Ověřuji…";
      const bajty = await klicZHesla(pole.value);
      const klic = await overKlic(bajty);
      if (!klic) {
        zprava.textContent = "Špatné heslo.";
        tlacitko.disabled = false;
        pole.select();
        return;
      }
      if (zaskrtavatko.checked) {
        try {
          localStorage.setItem(KLIC_V_PROHLIZECI, doBase64(bajty));
        } catch {
          // nejde uložit (anonymní okno) – příště se zeptáme znovu
        }
      }
      okno.close();
      okno.remove();
      hotovo(klic);
    });

    document.body.append(okno);
    okno.showModal();
  });
}

// Načte zašifrovaný soubor a vrátí rozšifrovaná data
async function nactiTajnyJson(cesta) {
  const [obal, klic] = await Promise.all([nactiJson(cesta), ziskejKlic()]);
  try {
    return await desifruj(obal, klic);
  } catch {
    throw new Error(`${cesta} nejde rozšifrovat. Nezměnilo se heslo?`);
  }
}

// Po načtení stránky: navigace, stav „aktualizováno“ v hlavičce a tlačítko Zamknout
document.addEventListener("DOMContentLoaded", () => {
  vykresliNavigaci();

  // <p data-stav="skola" data-max-hodin="48"> → „aktualizováno před 3 h“
  for (const prvek of document.querySelectorAll("[data-stav]")) {
    zobrazStav(prvek, prvek.dataset.stav, Number(prvek.dataset.maxHodin));
  }

  // Odkaz „zpět“ (např. z detailu předmětu do Školy) dostane šipku
  document.getElementById("zpet")?.prepend(vytvorIkonu("zpet"));

  // Tlačítko „Zamknout“ v patičce: smaže klíč z prohlížeče
  const zamknout = document.getElementById("zamknout");
  if (zamknout) {
    zamknout.prepend(vytvorIkonu("zamek"));
    zamknout.addEventListener("click", () => {
      zapomenKlic();
      location.reload();
    });
  }
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
