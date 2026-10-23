// Modul ŠKOLA: rozvrh, testy a předměty z Edookitu.
// Data jsou v data/skola/ a plní je skript stahovani/stahni.py.

const SKOLA_DATA = "data/skola/";

// Školní data jsou zašifrovaná: nactiSkolniData("rozvrh") načte rozvrh.enc.json
// a rozšifruje ho (při prvním načtení se zeptá na heslo).
function nactiSkolniData(nazev) {
  return nactiTajnyJson(SKOLA_DATA + nazev + ".enc.json");
}

// Načte předměty a vrátí je jako "slovník" podle id,
// takže pak stačí napsat predmety["matematika"] a máš celý předmět.
async function nactiPredmety() {
  const seznam = await nactiSkolniData("predmety");
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

// --- Dashboard: dlaždice „Dnes“ a karta modulu ---


// "08:45" → 525 (minut od půlnoci). Čísla se porovnávají snáz než text.
function naMinuty(cas) {
  const [hodiny, minuty] = cas.split(":").map(Number);
  return hodiny * 60 + minuty;
}

// Dlaždice „Rozvrh“ v sekci Dnes. O víkendu ukáže pondělí a změní nadpis.
async function vykresliDnesniRozvrh(obsah, nadpis) {
  const [rozvrh, predmety] = await Promise.all([nactiSkolniData("rozvrh"), nactiPredmety()]);
  let den = dnesniDen();
  const jeVikend = !den;
  if (jeVikend) {
    den = DNY[0];
    nadpis.textContent = "Rozvrh v pondělí";
  }

  const seznam = vytvor("ul", "seznam");
  // [...pole] udělá kopii, aby .sort nezměnil původní data
  const hodiny = [...(rozvrh.dny[den.klic] || [])].sort((a, b) => a.hodina - b.hodina);
  if (hodiny.length === 0) {
    seznam.append(vytvor("li", "slaby", "Dnes žádné hodiny"));
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
  obsah.append(seznam);
}

// Dlaždice „Nejbližší test“ v sekci Dnes: velký odpočet a pod ním podrobnosti
async function vykresliNejblizsiTest(obsah) {
  const [testy, predmety, rozvrh] = await Promise.all([
    nactiSkolniData("testy"),
    nactiPredmety(),
    nactiSkolniData("rozvrh"),
  ]);
  const [test] = nadchazejiciTesty(testy); // jen první = nejbližší
  if (!test) {
    obsah.append(vytvor("p", "slaby", "Žádné nadcházející testy"));
    return;
  }

  const zaKolik = textZaKolik(test.dny);
  const odpocet = vytvor("div", "odpocet", zaKolik[0].toUpperCase() + zaKolik.slice(1));
  if (test.dny <= BRZY_DNI) odpocet.classList.add("brzy");
  obsah.append(odpocet);

  const seznam = vytvor("ul", "seznam");
  seznam.append(vytvorTest(test, predmety[test.predmet], rozvrh.casy));
  seznam.style.marginTop = "10px";
  obsah.append(seznam);
}

// Přihlásíme modul: dvě dlaždice na Přehled, každá vede do své části záložky Škola
MODULY.push({
  id: "skola",
  zalozka: "skola",
  maxStariHodin: 48, // starší data = skript se 2 dny nespustil, něco je špatně
  dnes: [
    { nazev: "Rozvrh na dnes", odkaz: "skola.html#rozvrh", poradi: 1, vysoka: true, vykresli: vykresliDnesniRozvrh },
    { nazev: "Nejbližší test", odkaz: "skola.html#testy", poradi: 2, vykresli: vykresliNejblizsiTest },
  ],
});
