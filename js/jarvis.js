// Záložka JARVIS: chat s osobním asistentem.
//
// Jak to funguje:
//   1. Tvoje zpráva jde na backend (jarvis/worker.js) a ten ji pošle Claudovi.
//   2. Když Claude potřebuje data, odpoví „chci nástroj X“ (tool_use).
//   3. Nástroj vykoná TENHLE prohlížeč nad tvými rozšifrovanými daty
//      a výsledek pošle zpátky. Backend tvoje data ani heslo nikdy nevidí.
//   4. Opakuje se, dokud Claude nenapíše odpověď.

const MAX_KOL_NASTROJU = 8; // pojistka proti nekonečnému volání nástrojů
const KLIC_KONVERZACE = "jarvis-konverzace"; // sessionStorage = zmizí po zavření záložky

// --- Nástroje (jména a vstupy odpovídají seznamu NASTROJE v jarvis/worker.js) ---

const NASTROJE = {
  async rozvrh({ den }) {
    const [rozvrh, predmety] = await Promise.all([nactiSkolniData("rozvrh"), nactiPredmety()]);
    const dny = den === "tyden" ? DNY : DNY.filter((d) => d.klic === den);
    const vysledek = {};
    for (const d of dny) {
      vysledek[d.nazev] = (rozvrh.dny[d.klic] || []).map((h) => ({
        hodina: h.hodina,
        cas: `${rozvrh.casy[h.hodina].od}–${rozvrh.casy[h.hodina].do}`,
        predmet: predmety[h.predmet]?.nazev || h.predmet,
        ucebna: h.ucebna,
      }));
    }
    return vysledek;
  },

  async testy() {
    const [testy, predmety] = await Promise.all([nactiSkolniData("testy"), nactiPredmety()]);
    return nadchazejiciTesty(testy).map((t) => ({
      datum: t.datum.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" }),
      za_dni: t.dny,
      predmet: predmety[t.predmet]?.nazev || t.predmet,
      tema: t.tema,
      typ: t.typ,
      hodina: t.hodina,
    }));
  },

  async predmety() {
    const predmety = await nactiPredmety();
    return Object.values(predmety).map((p) => ({
      nazev: p.nazev,
      ucitel: p.ucitel,
      aktualni_tema: p.aktualniTema,
      materialy: (p.materialy || []).map((m) => m.nazev),
    }));
  },

  async kalendar({ dni }) {
    dni = Math.min(Math.max(Number(dni) || 1, 1), 30); // jen 1–30, ať se nic nerozbije
    const hranice = pulnoc(new Date()).getTime() + dni * 864e5;
    const udalosti = await nactiUdalosti();
    return udalosti
      .filter((u) => u.zacatek.getTime() < hranice)
      .map((u) => ({
        nazev: u.nazev,
        kdy: u.celodenni
          ? "celý den " + u.zacatek.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" })
          : u.zacatek.toLocaleString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }),
        konec: u.celodenni ? null : u.konec.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }),
        misto: u.misto,
        kalendar: u.kalendar,
      }));
  },

  async finance() {
    const data = await nactiAkcie();
    const { pozice, celkem } = spocitejPortfolio(data);
    const zaokrouhli = (c) => Math.round(c);
    return {
      hodnota_kc: zaokrouhli(celkem.hodnota),
      zmena_dnes_kc: zaokrouhli(celkem.zmenaDnes),
      zmena_dnes_procent: Number(celkem.zmenaDnesProcent.toFixed(2)),
      zisk_celkem_kc: zaokrouhli(celkem.zisk),
      zisk_celkem_procent: Number(celkem.ziskProcent.toFixed(2)),
      drzene: pozice.map((p) => ({
        nazev: p.akcie?.nazev || p.symbol,
        kusu: p.kusu,
        hodnota_kc: p.akcie ? zaokrouhli(p.hodnota) : null,
        zmena_dnes_procent: p.akcie?.zmena_den ?? null,
      })),
      sledovane: data.portfolio.sledovane.map((s) => ({
        nazev: data.ceny.akcie[s]?.nazev || s,
        cena: data.ceny.akcie[s]?.cena ?? null,
        mena: data.ceny.akcie[s]?.mena ?? null,
        zmena_dnes_procent: data.ceny.akcie[s]?.zmena_den ?? null,
      })),
    };
  },

  async zpravy({ pocet }) {
    pocet = Math.min(Math.max(Number(pocet) || 5, 1), 15);
    const zpravy = await nactiZpravy();
    return zpravy.slice(0, pocet).map((z) => ({ zdroj: z.zdroj, titulek: z.titulek, perex: z.perex }));
  },
};

// Vykoná jeden nástroj a vrátí blok tool_result pro Clauda.
// Chyba nástroje (třeba chybějící data) se Claudovi pošle jako is_error,
// ať to umí vysvětlit, místo aby si něco vymyslel.
async function vykonejNastroj(blok) {
  try {
    const nastroj = NASTROJE[blok.name];
    if (!nastroj) throw new Error("Neznámý nástroj " + blok.name);
    const data = await nastroj(blok.input || {});
    return { type: "tool_result", tool_use_id: blok.id, content: JSON.stringify(data) };
  } catch (chyba) {
    return { type: "tool_result", tool_use_id: blok.id, content: "Chyba: " + chyba.message, is_error: true };
  }
}

// --- Konverzace ---

// Zprávy přesně ve tvaru Claude API (role user/assistant). Odpovědi Clauda
// ukládáme celé a beze změny – API to tak vyžaduje (i neviditelné bloky přemýšlení).
let konverzace = nactiKonverzaci();
let token = null;

function nactiKonverzaci() {
  try {
    return JSON.parse(sessionStorage.getItem(KLIC_KONVERZACE)) || [];
  } catch {
    return [];
  }
}

function ulozKonverzaci() {
  try {
    sessionStorage.setItem(KLIC_KONVERZACE, JSON.stringify(konverzace));
  } catch {
    // neuložené = po obnovení stránky začne konverzace znovu, nic vážného
  }
}

// „[pátek 23. 10. 2026, 11:40]“ – Claude jinak neví, kolik je hodin
function razitko() {
  const ted = new Date();
  return ted.toLocaleString("cs-CZ", {
    weekday: "long", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

async function zavolejBackend() {
  const odpoved = await fetch(JARVIS_URL.replace(/\/$/, "") + "/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ messages: konverzace }),
  });
  const data = await odpoved.json().catch(() => ({}));
  if (!odpoved.ok) throw new Error(data.chyba || `Backend vrátil chybu ${odpoved.status}.`);
  return data;
}

async function posli(text) {
  const zalohaDelky = konverzace.length;
  konverzace.push({ role: "user", content: `[${razitko()}] ${text}` });
  vykresli();
  nastavPremysleni(true);

  try {
    for (let kolo = 0; kolo < MAX_KOL_NASTROJU; kolo++) {
      const odpoved = await zavolejBackend();

      // Odmítnutí bezpečnostním filtrem: obsah může být prázdný → do historie nedáváme
      if (odpoved.stop_reason === "refusal") {
        konverzace.length = zalohaDelky;
        ukazUpozorneni("Na tohle Jarvis neodpoví. Zkus to zeptat jinak.");
        return;
      }

      konverzace.push({ role: "assistant", content: odpoved.content });
      vykresli();

      if (odpoved.stop_reason !== "tool_use") {
        if (odpoved.stop_reason === "max_tokens") ukazUpozorneni("Odpověď byla moc dlouhá a uřízla se.");
        return;
      }

      // Claude chce nástroje – vykonáme všechny najednou a výsledky pošleme
      // v JEDNÉ zprávě (tak to API vyžaduje)
      const pozadavky = odpoved.content.filter((b) => b.type === "tool_use");
      const vysledky = await Promise.all(pozadavky.map(vykonejNastroj));
      konverzace.push({ role: "user", content: vysledky });
    }
    ukazUpozorneni("Jarvis se zamotal do nástrojů, zkus otázku položit jinak.");
  } catch (chyba) {
    // Nepovedlo se → vrátíme konverzaci, jak byla, ať zůstane platná
    konverzace.length = zalohaDelky;
    ukazUpozorneni(chyba.message);
  } finally {
    nastavPremysleni(false);
    ulozKonverzaci();
    vykresli();
  }
}

// --- Vykreslení ---

const seznam = document.getElementById("konverzace");
const formular = document.getElementById("dotaz");
const pole = document.getElementById("dotaz-text");
const tlacitko = document.getElementById("dotaz-odeslat");

// Z konverzace vybere jen to, co se má ukázat: tvoje otázky a texty Jarvise.
// Výsledky nástrojů a bloky přemýšlení zůstanou schované.
function vykresli() {
  seznam.replaceChildren();
  for (const zprava of konverzace) {
    if (zprava.role === "user" && typeof zprava.content === "string") {
      seznam.append(vytvor("div", "bublina ja", zprava.content.replace(/^\[[^\]]*\]\s*/, "")));
    } else if (zprava.role === "assistant") {
      const text = zprava.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (text) seznam.append(vytvor("div", "bublina jarvis", text));
    }
  }
  if (konverzace.length === 0) ukazNavrhy();
  seznam.lastElementChild?.scrollIntoView({ block: "end", behavior: "smooth" });
}

// Návrhy otázek, když je konverzace prázdná
function ukazNavrhy() {
  const navrhy = vytvor("div", "navrhy");
  navrhy.append(vytvor("p", "slaby", "Zeptej se třeba:"));
  for (const otazka of ["Co mám dnes?", "Kdy je další test a z čeho?", "Co mě čeká tento týden?", "Jak je na tom portfolio?"]) {
    const t = vytvor("button", "filtr", otazka);
    t.type = "button";
    t.addEventListener("click", () => posli(otazka));
    navrhy.append(t);
  }
  seznam.append(navrhy);
}

function nastavPremysleni(premysli) {
  tlacitko.disabled = premysli;
  document.getElementById("premysleni").hidden = !premysli;
}

function ukazUpozorneni(text) {
  document.getElementById("upozorneni").textContent = text;
  setTimeout(() => (document.getElementById("upozorneni").textContent = ""), 8000);
}

// --- Spuštění ---

formular.addEventListener("submit", (udalost) => {
  udalost.preventDefault();
  const text = pole.value.trim();
  if (!text || tlacitko.disabled) return;
  pole.value = "";
  posli(text);
});

// Enter odešle, Shift+Enter udělá nový řádek
pole.addEventListener("keydown", (udalost) => {
  if (udalost.key === "Enter" && !udalost.shiftKey) {
    udalost.preventDefault();
    formular.requestSubmit();
  }
});

document.getElementById("nova-konverzace").addEventListener("click", () => {
  konverzace = [];
  ulozKonverzaci();
  vykresli();
});

async function spust() {
  if (!JARVIS_URL) {
    seznam.replaceChildren(vytvor("p", "chyba", "Jarvis ještě nemá backend. Vlož adresu Workera do js/jarvis-nastaveni.js."));
    tlacitko.disabled = true;
    return;
  }
  try {
    ({ token } = await nactiTajnyJson("data/jarvis/token.enc.json"));
  } catch {
    seznam.replaceChildren(vytvor("p", "chyba", "Chybí token Jarvise. Spusť stahovani/jarvis_token.py a nahraj ho."));
    tlacitko.disabled = true;
    return;
  }
  vykresli();
  pole.focus();
}

spust();
