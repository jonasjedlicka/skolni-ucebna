// Společné funkce, které používají všechny stránky a všechny moduly.
// Tenhle soubor se musí na stránce načíst jako první (před moduly).

// Seznam modulů dashboardu. Každý soubor v js/moduly/ sem přidá jeden záznam:
// { id, nazev, odkaz, sirka, maxStariHodin, vykresli(obsah) }
// Úvodní stránka pak projde seznam a každému modulu vytvoří kartu.
const MODULY = [];

// Načte jeden JSON soubor a vrátí jeho obsah jako JavaScriptový objekt.
// "async" znamená, že funkce chvíli čeká (na odpověď serveru);
// "await" je místo, kde se čeká.
async function nactiJson(cesta) {
  const odpoved = await fetch(cesta);
  if (!odpoved.ok) {
    throw new Error(`Nepodařilo se načíst ${cesta} (chyba ${odpoved.status})`);
  }
  return odpoved.json();
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
  kontejner.replaceChildren(vytvor("p", "chyba", "⚠️ " + chyba.message));
  console.error(chyba);
}
