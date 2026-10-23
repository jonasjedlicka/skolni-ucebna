// Modul ŠKOLA: rozvrh, testy a předměty z Edookitu.
// Data jsou v data/skola/ a plní je skript stahovani/stahni.py.

const SKOLA_DATA = "data/skola/";

// Načte předměty a vrátí je jako "slovník" podle id,
// takže pak stačí napsat predmety["matematika"] a máš celý předmět.
async function nactiPredmety() {
  const seznam = await nactiJson(SKOLA_DATA + "predmety.json");
  const podleId = {};
  for (const predmet of seznam) {
    podleId[predmet.id] = predmet;
  }
  return podleId;
}

// --- Rozvrh ---

// Dny v týdnu: "klic" musí odpovídat názvům v rozvrh.json.
const DNY = [
  { klic: "pondeli", nazev: "Pondělí" },
  { klic: "utery", nazev: "Úterý" },
  { klic: "streda", nazev: "Středa" },
  { klic: "ctvrtek", nazev: "Čtvrtek" },
  { klic: "patek", nazev: "Pátek" },
];

// Vrátí dnešní den z DNY, o víkendu undefined.
// getDay() vrací 0 = neděle, 1 = pondělí … 6 = sobota.
function dnesniDen() {
  return DNY[new Date().getDay() - 1];
}

// Jedna hodina v rozvrhu (používá ji rozvrh i úvodní stránka).
function vytvorHodinu(cislo, cas, hodina, predmet) {
  const polozka = vytvor("li", "polozka");
  polozka.append(vytvor("span", "polozka-cas", cas.od));

  const hlavni = vytvor("div", "polozka-hlavni");
  if (predmet) {
    // Barva proužku se bere z predmety.json (CSS proměnná --barva-predmetu)
    polozka.style.setProperty("--barva-predmetu", predmet.barva);
    const odkaz = vytvor("a", "polozka-nazev", predmet.nazev);
    odkaz.href = "predmet.html?id=" + predmet.id;
    hlavni.append(odkaz);
  } else {
    // Předmět v rozvrhu je, ale v predmety.json chybí → ukážeme aspoň jeho id
    hlavni.append(vytvor("div", "polozka-nazev", hodina.predmet));
  }
  hlavni.append(vytvor("div", "polozka-detail", `${cislo}. hodina · ${hodina.ucebna}`));

  polozka.append(hlavni);
  return polozka;
}

// --- Testy ---

// Testy, které jsou za tolik dní nebo dřív, se zvýrazní červeně.
const BRZY_DNI = 3;

// Z testů z testy.json nechá jen nadcházející, seřazené od nejbližšího:
// 1. ke každému dopočítá datum a kolik dní zbývá,
// 2. vyhodí ty, které už proběhly (dny < 0),
// 3. seřadí podle data.
function nadchazejiciTesty(testy) {
  return testy
    .map((test) => {
      const datum = parsujDatum(test.datum);
      return { ...test, datum, dny: dnyDo(datum) };
    })
    .filter((test) => test.dny >= 0)
    .sort((a, b) => a.datum - b.datum);
}

// Jeden test v seznamu (používá ho stránka testů i úvodní stránka).
function vytvorTest(test, predmet, casy) {
  const polozka = vytvor("li", "polozka");

  const hlavni = vytvor("div", "polozka-hlavni");
  if (predmet) {
    polozka.style.setProperty("--barva-predmetu", predmet.barva);
    const odkaz = vytvor("a", "polozka-nazev", predmet.nazev);
    odkaz.href = "predmet.html?id=" + predmet.id;
    hlavni.append(odkaz);
  } else {
    hlavni.append(vytvor("div", "polozka-nazev", test.predmet));
  }
  hlavni.append(vytvor("div", "", test.tema));

  // Např. „pondělí 2. 11. · 5. hodina (11:50) · Malá písemka“
  // toLocaleDateString umí napsat datum česky sám.
  const datumText = test.datum.toLocaleDateString("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
  });
  const casti = [datumText];
  if (test.hodina) {
    const cas = casy[test.hodina];
    casti.push(cas ? `${test.hodina}. hodina (${cas.od})` : `${test.hodina}. hodina`);
  }
  if (test.typ) casti.push(test.typ);
  hlavni.append(vytvor("div", "polozka-detail", casti.join(" · ")));
  polozka.append(hlavni);

  const stitek = vytvor("span", "stitek", textZaKolik(test.dny));
  if (test.dny <= BRZY_DNI) stitek.classList.add("brzy");
  polozka.append(stitek);

  return polozka;
}

// --- Předměty ---

// Dlaždice s odkazem na stránku předmětu (používá ji úvod i stránka předmětu).
function vytvorDlazdici(predmet) {
  const dlazdice = vytvor("a", "dlazdice");
  dlazdice.href = "predmet.html?id=" + predmet.id;
  dlazdice.style.setProperty("--barva-predmetu", predmet.barva);
  dlazdice.append(vytvor("div", "dlazdice-zkratka", predmet.zkratka));
  dlazdice.append(vytvor("div", "", predmet.nazev));
  return dlazdice;
}

// --- Karta na dashboardu ---

// Kolik nejbližších testů ukázat na dashboardu
const POCET_TESTU_NA_KARTE = 3;

// "08:45" → 525 (minut od půlnoci). Čísla se porovnávají snáz než text.
function naMinuty(cas) {
  const [hodiny, minuty] = cas.split(":").map(Number);
  return hodiny * 60 + minuty;
}

async function vykresliSkolu(obsah) {
  const [rozvrh, predmety, testy] = await Promise.all([
    nactiJson(SKOLA_DATA + "rozvrh.json"),
    nactiPredmety(),
    nactiJson(SKOLA_DATA + "testy.json"),
  ]);

  const sloupce = vytvor("div", "dva-sloupce");
  sloupce.append(vytvorDnesniHodiny(rozvrh, predmety));
  sloupce.append(vytvorNejblizsiTesty(testy, predmety, rozvrh.casy));
  obsah.append(sloupce);

  // Předměty jsou schované pod rozbalovacím nadpisem, ať karta není moc dlouhá.
  // <details> a <summary> umí rozbalování samy, bez JavaScriptu.
  const vsechny = Object.values(predmety);
  const rozbal = vytvor("details", "predmety-rozbal");
  rozbal.append(vytvor("summary", "", `Předměty (${vsechny.length})`));
  const mrizka = vytvor("div", "mrizka");
  mrizka.append(...vsechny.map(vytvorDlazdici));
  rozbal.append(mrizka);
  obsah.append(rozbal);
}

function vytvorDnesniHodiny(rozvrh, predmety) {
  const sekce = vytvor("section", "sekce");
  let den = dnesniDen();
  const jeVikend = !den;
  if (jeVikend) den = DNY[0]; // o víkendu ukážeme, co tě čeká v pondělí

  const nadpis = vytvor("div", "sekce-nadpis");
  nadpis.append(vytvor("h3", "", jeVikend ? "V pondělí" : "Dnes"));
  const odkaz = vytvor("a", "", "Celý rozvrh →");
  odkaz.href = "rozvrh.html";
  nadpis.append(odkaz);
  sekce.append(nadpis);

  const seznam = vytvor("ul", "seznam");
  // [...pole] udělá kopii, aby .sort nezměnil původní data
  const hodiny = [...(rozvrh.dny[den.klic] || [])].sort((a, b) => a.hodina - b.hodina);
  if (hodiny.length === 0) {
    seznam.append(vytvor("li", "slaby", "Žádné hodiny 🎉"));
  }

  const ted = new Date();
  const tedMinuty = ted.getHours() * 60 + ted.getMinutes();
  for (const hodina of hodiny) {
    const cas = rozvrh.casy[hodina.hodina];
    const polozka = vytvorHodinu(hodina.hodina, cas, hodina, predmety[hodina.predmet]);
    // Podle aktuálního času: odučené hodiny ztlumíme, probíhající zvýrazníme
    if (!jeVikend) {
      if (tedMinuty >= naMinuty(cas.do)) {
        polozka.classList.add("probehla");
      } else if (tedMinuty >= naMinuty(cas.od)) {
        polozka.classList.add("ted");
        polozka.append(vytvor("span", "stitek brzy", "teď"));
      }
    }
    seznam.append(polozka);
  }
  sekce.append(seznam);
  return sekce;
}

function vytvorNejblizsiTesty(testy, predmety, casy) {
  const sekce = vytvor("section", "sekce");
  const nadpis = vytvor("div", "sekce-nadpis");
  nadpis.append(vytvor("h3", "", "Nejbližší testy"));
  const odkaz = vytvor("a", "", "Všechny →");
  odkaz.href = "testy.html";
  nadpis.append(odkaz);
  sekce.append(nadpis);

  const seznam = vytvor("ul", "seznam");
  // slice(0, 3) vezme jen první tři
  const nejblizsi = nadchazejiciTesty(testy).slice(0, POCET_TESTU_NA_KARTE);
  if (nejblizsi.length === 0) {
    seznam.append(vytvor("li", "slaby", "Žádné nadcházející testy 🎉"));
  }
  for (const test of nejblizsi) {
    seznam.append(vytvorTest(test, predmety[test.predmet], casy));
  }
  sekce.append(seznam);
  return sekce;
}

// Přihlásíme modul na dashboard
MODULY.push({
  id: "skola",
  nazev: "📚 Škola",
  odkaz: "rozvrh.html",
  sirka: "plna", // karta přes celou šířku dashboardu
  maxStariHodin: 48, // starší data = skript se 2 dny nespustil, něco je špatně
  vykresli: vykresliSkolu,
});
