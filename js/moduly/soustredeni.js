// Modul SOUSTŘEDĚNÍ: odpočítávadlo Pomodoro (práce → pauza → práce …).
// Stav odpočtu se ukládá v prohlížeči (localStorage), takže odpočet běží dál,
// i když stránku zavřeš nebo přepneš záložku. Ukládáme ČAS KONCE, ne zbývající
// sekundy – prohlížeč totiž časovače na pozadí zpomaluje, hodiny ale ne.
// Odpočet běží na každém zařízení zvlášť; počty hotových pomodor se ukládají
// zašifrovaně na GitHub (js/zapisy.js), takže statistiky jsou všude stejné.

const POMODORO_KLIC = "ucebna-pomodoro";
const POMODORO_HISTORIE_KLIC = "ucebna-pomodoro-historie"; // starý zápis (jen kvůli převodu)

// Výchozí délky (v minutách); upravit jdou v Plánu → Soustředění → Nastavení
const POMODORO_VYCHOZI = { prace: 25, pauza: 5, dlouhaPauza: 15, kolDoDlouhe: 4 };

const FAZE = {
  prace: "Práce",
  pauza: "Krátká pauza",
  dlouhaPauza: "Dlouhá pauza",
};

// --- Ukládání (nactiZProhlizece / ulozDoProhlizece jsou ve spolecne.js) ---

// Stav: faze, konec (čas v ms, když běží), zbyva (ms, když je pozastaveno),
// kolo = kolikáté pracovní kolo právě je (1–4), nastaveni = délky fází
function nactiPomodoro() {
  const stav = nactiZProhlizece(POMODORO_KLIC, { faze: "prace", konec: null, zbyva: null, kolo: 1 });
  stav.nastaveni = { ...POMODORO_VYCHOZI, ...stav.nastaveni };
  return stav;
}

function ulozPomodoro(stav) {
  ulozDoProhlizece(POMODORO_KLIC, stav);
}

function delkaFaze(stav, faze = stav.faze) {
  return stav.nastaveni[faze] * 60000;
}

function bezi(stav) {
  return stav.konec !== null;
}

// Kolik ms zbývá: když běží, do konce; když stojí, uložený zbytek (nebo celá fáze)
function zbyvajiciMs(stav) {
  if (bezi(stav)) return Math.max(0, stav.konec - Date.now());
  return stav.zbyva ?? delkaFaze(stav);
}

// --- Ovládání ---

function spustPomodoro(stav) {
  stav.konec = Date.now() + zbyvajiciMs(stav);
  stav.zbyva = null;
  ulozPomodoro(stav);
}

function pozastavPomodoro(stav) {
  stav.zbyva = zbyvajiciMs(stav);
  stav.konec = null;
  ulozPomodoro(stav);
}

// Přejde na další fázi. Po skončené práci připíše pomodoro do historie.
// Další fáze se sama nespustí – počká na tlačítko Spustit.
function dalsiFaze(stav, dokonceno) {
  if (stav.faze === "prace") {
    if (dokonceno) zapisPomodoro(stav.nastaveni.prace);
    stav.faze = stav.kolo >= stav.nastaveni.kolDoDlouhe ? "dlouhaPauza" : "pauza";
  } else {
    stav.kolo = stav.faze === "dlouhaPauza" ? 1 : stav.kolo + 1;
    stav.faze = "prace";
  }
  stav.konec = null;
  stav.zbyva = null;
  ulozPomodoro(stav);
}

// Začne znovu od prvního kola práce
function resetujPomodoro(stav) {
  Object.assign(stav, { faze: "prace", konec: null, zbyva: null, kolo: 1 });
  ulozPomodoro(stav);
}

// Doběhla fáze, zatímco byla stránka zavřená nebo na pozadí? Pak ji uzavřeme.
// Vrátí true, když se fáze právě teď ukončila.
function zkontrolujKonec(stav) {
  if (bezi(stav) && stav.konec <= Date.now()) {
    // Je otevřených víc karet? Fázi mohla uzavřít už jiná – pak jen převezmeme
    // její stav, ať se pomodoro nezapíše dvakrát a nepípá se dvakrát.
    const ulozeny = nactiPomodoro();
    if (ulozeny.konec !== stav.konec || ulozeny.faze !== stav.faze) {
      Object.assign(stav, ulozeny);
      return false;
    }
    dalsiFaze(stav, true);
    return true;
  }
  return false;
}

// --- Historie: kolik pomodor a minut za který den ---
// Každé dokončené pomodoro je jedna položka { datum, minut, pocet } v zápisech
// (zašifrovaně na GitHubu), takže se počty sčítají ze všech zařízení.
// Samotný odpočet (co právě běží) zůstává v prohlížeči – na každém zařízení svůj.

function pomodoraZapisy() {
  return otevriZapisy("soustredeni", "soustředění");
}

// Dnešní datum jako "2026-10-23" v místním čase (švédský formát je přesně tenhle)
function datumKlic(datum = new Date()) {
  return datum.toLocaleDateString("sv-SE");
}

// { "2026-10-23": { pocet, minut }, … }
function nactiHistorii() {
  const historie = {};
  for (const p of pomodoraZapisy().polozky()) {
    const den = historie[p.datum] || { pocet: 0, minut: 0 };
    historie[p.datum] = { pocet: den.pocet + (p.pocet || 1), minut: den.minut + p.minut };
  }
  return historie;
}

function zapisPomodoro(minut) {
  pomodoraZapisy().uloz({ datum: datumKlic(), minut, pocet: 1 });
}

function dnesniPomodora() {
  return nactiHistorii()[datumKlic()] || { pocet: 0, minut: 0 };
}

// Dřív byla historie jen v prohlížeči – převedeme ji jednou na GitHub (den = jedna položka)
async function prevedStarouHistorii() {
  let stara = null;
  try {
    stara = JSON.parse(localStorage.getItem(POMODORO_HISTORIE_KLIC));
  } catch {
    return;
  }
  if (!stara) return;
  await pomodoraZapisy().hotovo;
  for (const [datum, den] of Object.entries(stara)) {
    pomodoraZapisy().uloz({ id: "puvodni-" + datum, datum, minut: den.minut, pocet: den.pocet });
  }
  localStorage.removeItem(POMODORO_HISTORIE_KLIC);
}

prevedStarouHistorii();

// --- Zobrazení ---

// 1 500 000 ms → "25:00"
function formatujCas(ms) {
  const sekundy = Math.ceil(ms / 1000);
  const m = Math.floor(sekundy / 60);
  const s = sekundy % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Česky: 1 pomodoro, 2–4 pomodora, 5 pomodor
function textPomodor(pocet) {
  if (pocet === 1) return "1 pomodoro";
  if (pocet >= 2 && pocet <= 4) return `${pocet} pomodora`;
  return `${pocet} pomodor`;
}

// Kroužky kol: ● hotové, ◉ právě probíhající, ○ zbývající
function vytvorKola(stav) {
  const kola = vytvor("div", "pomodoro-kola");
  kola.setAttribute("aria-label", `Kolo ${stav.kolo} ze ${stav.nastaveni.kolDoDlouhe}`);
  for (let i = 1; i <= stav.nastaveni.kolDoDlouhe; i++) {
    const hotove = i < stav.kolo || (i === stav.kolo && stav.faze !== "prace");
    const kolo = vytvor("span", "pomodoro-kolo");
    if (hotove) kolo.classList.add("hotove");
    else if (i === stav.kolo) kolo.classList.add("aktualni");
    kola.append(kolo);
  }
  return kola;
}

// Dlaždice „Soustředění“ na Přehledu: zbývající čas a tlačítko Spustit/Pozastavit
function vykresliSoustredeniDnes(obsah) {
  const stav = nactiPomodoro();
  zkontrolujKonec(stav);

  const radek = vytvor("div", "pomodoro-dlazdice");
  const cas = vytvor("div", "pomodoro-cas-maly", formatujCas(zbyvajiciMs(stav)));
  const popis = vytvor("div", "polozka-detail");
  const text = vytvor("div", "");
  text.append(cas, popis);

  const tlacitko = vytvor("button", "kulate-tlacitko");
  tlacitko.type = "button";
  radek.append(text, tlacitko);

  const dnes = vytvor("p", "polozka-detail");
  obsah.append(radek, dnes);

  function obnov() {
    if (zkontrolujKonec(stav)) oznamKonecFaze(stav);
    cas.textContent = formatujCas(zbyvajiciMs(stav));
    popis.textContent = `${FAZE[stav.faze]} · kolo ${stav.kolo}/${stav.nastaveni.kolDoDlouhe}` + (bezi(stav) ? "" : " · stojí");
    tlacitko.replaceChildren(vytvorIkonu(bezi(stav) ? "pauza" : "spustit"));
    tlacitko.setAttribute("aria-label", bezi(stav) ? "Pozastavit" : "Spustit");
    const d = dnesniPomodora();
    dnes.textContent = d.pocet ? `Dnes ${textPomodor(d.pocet)} · ${d.minut} min soustředění` : "Dnes zatím žádné pomodoro.";
  }

  tlacitko.addEventListener("click", () => {
    Object.assign(stav, nactiPomodoro()); // kdyby se mezitím změnil v jiné kartě
    if (bezi(stav)) pozastavPomodoro(stav);
    else {
      pozadejOUpozorneni();
      spustPomodoro(stav);
    }
    obnov();
  });
  // Změna v jiné kartě prohlížeče (např. otevřený Plán) se projeví i tady
  window.addEventListener("storage", (udalost) => {
    if (udalost.key === POMODORO_KLIC || udalost.key === POMODORO_HISTORIE_KLIC) {
      Object.assign(stav, nactiPomodoro());
      obnov();
    }
  });

  obnov();
  setInterval(obnov, 1000);
}

// --- Upozornění na konec fáze ---

// Povolení k oznámením se ptáme až po kliknutí na Spustit (prohlížeče
// jinak dotaz zablokují). Na iPhonu oznámení fungují jen u webu přidaného na plochu.
function pozadejOUpozorneni() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

// Krátké pípnutí vyrobené přímo v prohlížeči (Web Audio) – bez zvukového souboru
function pipni() {
  try {
    const zvuk = new AudioContext();
    [0, 0.35, 0.7].forEach((zacatek) => {
      const ton = zvuk.createOscillator();
      const hlasitost = zvuk.createGain();
      ton.frequency.value = 880;
      hlasitost.gain.setValueAtTime(0.25, zvuk.currentTime + zacatek);
      hlasitost.gain.exponentialRampToValueAtTime(0.001, zvuk.currentTime + zacatek + 0.25);
      ton.connect(hlasitost).connect(zvuk.destination);
      ton.start(zvuk.currentTime + zacatek);
      ton.stop(zvuk.currentTime + zacatek + 0.3);
    });
  } catch {
    // Zvuk není dostupný – nevadí
  }
}

// stav = už NOVÁ fáze (ta, která přijde po skončené)
function oznamKonecFaze(stav) {
  pipni();
  const text = stav.faze === "prace" ? "Pauza skončila, jdeme pracovat." : `Hotovo! Teď ${FAZE[stav.faze].toLowerCase()}.`;
  if ("Notification" in window && Notification.permission === "granted") {
    // tag: když je otevřených víc karet, ukáže se oznámení jen jednou
    new Notification("Soustředění", { body: text, tag: "pomodoro" });
  }
}

MODULY.push({
  id: "soustredeni",
  zalozka: "plan",
  // bez maxStariHodin: nic se nestahuje, stav je jen v prohlížeči
  dnes: [{ nazev: "Soustředění", odkaz: "plan.html#soustredeni", poradi: 3.5, vykresli: vykresliSoustredeniDnes }],
});
