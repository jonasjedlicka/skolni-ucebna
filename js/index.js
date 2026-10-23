// Úvodní stránka: dnešní hodiny, nejbližší testy a dlaždice předmětů.
// Většinu práce dělají funkce z data.js, tady je jen skládáme dohromady.

// Kolik nejbližších testů ukázat na úvodu
const POCET_TESTU = 3;

async function zobrazUvod() {
  try {
    const [rozvrh, predmety, testy] = await Promise.all([
      nactiJson("data/rozvrh.json"),
      nactiPredmety(),
      nactiJson("data/testy.json"),
    ]);

    zobrazDnesniHodiny(rozvrh, predmety);
    zobrazNejblizsiTesty(testy, predmety, rozvrh.casy);
    zobrazPredmety(predmety);
  } catch (chyba) {
    ukazChybu(document.querySelector("main"), chyba);
  }
}

function zobrazDnesniHodiny(rozvrh, predmety) {
  const seznam = document.getElementById("dnesni-hodiny");
  const nadpis = document.getElementById("dnes-nadpis");

  let den = dnesniDen();
  const jeVikend = !den;
  if (jeVikend) {
    // O víkendu ukážeme, co tě čeká v pondělí
    den = DNY[0];
    nadpis.textContent = "V pondělí";
  }

  // [...pole] udělá kopii, aby .sort nezměnil původní data
  const hodiny = [...(rozvrh.dny[den.klic] || [])].sort((a, b) => a.hodina - b.hodina);

  seznam.replaceChildren();
  if (hodiny.length === 0) {
    seznam.append(vytvor("li", "slaby", "Žádné hodiny 🎉"));
    return;
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
}

// "08:45" → 525 (minut od půlnoci). Čísla se porovnávají snáz než text.
function naMinuty(cas) {
  const [hodiny, minuty] = cas.split(":").map(Number);
  return hodiny * 60 + minuty;
}

function zobrazNejblizsiTesty(testy, predmety, casy) {
  const seznam = document.getElementById("nejblizsi-testy");
  // slice(0, 3) vezme jen první tři
  const nejblizsi = nadchazejiciTesty(testy).slice(0, POCET_TESTU);

  seznam.replaceChildren();
  if (nejblizsi.length === 0) {
    seznam.append(vytvor("li", "slaby", "Žádné nadcházející testy 🎉"));
    return;
  }
  for (const test of nejblizsi) {
    seznam.append(vytvorTest(test, predmety[test.predmet], casy));
  }
}

function zobrazPredmety(predmety) {
  const mrizka = document.getElementById("predmety");
  // Object.values udělá ze slovníku zpátky obyčejný seznam
  mrizka.replaceChildren(...Object.values(predmety).map(vytvorDlazdici));
}

zobrazUvod();
