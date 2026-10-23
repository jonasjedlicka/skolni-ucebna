// Vykreslí týdenní rozvrh z data/skola/rozvrh.json do <div id="rozvrh">.
// Funkce DNY, dnesniDen a vytvorHodinu jsou v js/moduly/skola.js.

async function zobrazRozvrh() {
  const kontejner = document.getElementById("rozvrh");
  try {
    // Promise.all načte oba soubory najednou a počká na oba.
    const [rozvrh, predmety] = await Promise.all([
      nactiJson(SKOLA_DATA + "rozvrh.json"),
      nactiPredmety(),
    ]);

    const dnes = dnesniDen(); // o víkendu undefined → nezvýrazní se nic

    kontejner.replaceChildren(); // smaže text „Rozvrh se načítá…“
    for (const den of DNY) {
      const hodiny = rozvrh.dny[den.klic] || [];
      kontejner.append(vytvorDen(den, hodiny, rozvrh.casy, predmety, den === dnes));
    }
  } catch (chyba) {
    ukazChybu(kontejner, chyba);
  }
}

// Jeden den = nadpis + seznam hodin.
function vytvorDen(den, hodiny, casy, predmety, jeDnes) {
  const sekce = vytvor("section", jeDnes ? "den dnes" : "den");
  const nadpis = vytvor("h2", "den-nazev", den.nazev);
  if (jeDnes) {
    nadpis.append(vytvor("span", "stitek", "dnes"));
  }
  sekce.append(nadpis);

  const seznam = vytvor("ul", "seznam");
  if (hodiny.length === 0) {
    seznam.append(vytvor("li", "slaby", "Žádné hodiny"));
  }

  // Projdeme hodiny od 1. do poslední. Kde nic není, ukážeme „volno“,
  // aby hodiny ve sloupcích na počítači seděly pod sebou.
  const posledni = Math.max(0, ...hodiny.map((h) => h.hodina));
  for (let cislo = 1; cislo <= posledni; cislo++) {
    const hodina = hodiny.find((h) => h.hodina === cislo);
    const cas = casy[cislo];
    if (hodina) {
      seznam.append(vytvorHodinu(cislo, cas, hodina, predmety[hodina.predmet]));
    } else {
      seznam.append(vytvorVolno(cislo, cas));
    }
  }

  sekce.append(seznam);
  return sekce;
}

function vytvorVolno(cislo, cas) {
  const polozka = vytvor("li", "polozka volno");
  polozka.append(vytvor("span", "polozka-cas", cas.od));
  polozka.append(vytvor("div", "polozka-detail", `${cislo}. hodina · volno`));
  return polozka;
}

zobrazRozvrh();
