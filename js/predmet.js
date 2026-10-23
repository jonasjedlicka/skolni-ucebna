// Vykreslí stránku jednoho předmětu do <div id="predmet">.
// Který předmět, pozná z adresy: predmet.html?id=fyzika

// Štítky pro jednotlivé typy materiálů v predmety.json (bez barevných emoji)
const TYPY_MATERIALU = {
  poznamka: "Poznámka",
  odkaz: "Odkaz",
  soubor: "Soubor",
};

async function zobrazPredmet() {
  const obsah = document.getElementById("predmet");
  try {
    const [predmety, testy] = await Promise.all([
      nactiPredmety(),
      nactiSkolniData("testy"),
    ]);

    // location.search je část adresy za „?“, tedy "?id=fyzika".
    // URLSearchParams z ní umí vytáhnout hodnotu podle názvu.
    const id = new URLSearchParams(location.search).get("id");
    const predmet = predmety[id];

    obsah.replaceChildren();
    if (!predmet) {
      // Špatné nebo chybějící id → ukážeme seznam všech předmětů
      zobrazVsechnyPredmety(obsah, predmety, id);
      return;
    }

    document.title = predmet.nazev + " · Dashboard"; // text v záložce prohlížeče
    // Barva předmětu pro všechno uvnitř (proužky u materiálů, nadpis)
    obsah.style.setProperty("--barva-predmetu", predmet.barva);

    obsah.append(vytvorHlavicku(predmet));
    obsah.append(vytvorTema(predmet));

    const jehoTesty = nadchazejiciTesty(testy).filter((test) => test.predmet === predmet.id);
    if (jehoTesty.length > 0) {
      obsah.append(vytvorTesty(jehoTesty));
    }

    obsah.append(vytvorMaterialy(predmet.materialy || []));
  } catch (chyba) {
    ukazChybu(obsah, chyba);
  }
}

function vytvorHlavicku(predmet) {
  const hlavicka = vytvor("div", "predmet-hlavicka");
  hlavicka.append(vytvor("div", "dlazdice-zkratka", predmet.zkratka));
  hlavicka.append(vytvor("h1", "", predmet.nazev));
  if (predmet.ucitel) {
    hlavicka.append(vytvor("p", "slaby", predmet.ucitel));
  }
  return hlavicka;
}

function vytvorTema(predmet) {
  const sekce = vytvor("section", "sekce karta");
  sekce.append(vytvor("h2", "", "Právě probíráme"));
  sekce.append(vytvor("p", "tema", predmet.aktualniTema || "Zatím nevyplněno."));
  return sekce;
}

function vytvorTesty(testy) {
  const sekce = vytvor("section", "sekce");
  sekce.append(vytvor("h2", "", "Nadcházející testy"));
  const seznam = vytvor("ul", "seznam");
  for (const test of testy) {
    const polozka = vytvor("li", "polozka");
    const hlavni = vytvor("div", "polozka-hlavni");
    hlavni.append(vytvor("div", "polozka-nazev", test.tema));
    const datumText = test.datum.toLocaleDateString("cs-CZ", {
      weekday: "long",
      day: "numeric",
      month: "numeric",
    });
    hlavni.append(vytvor("div", "polozka-detail", [datumText, test.typ].filter(Boolean).join(" · ")));
    polozka.append(hlavni);
    const stitek = vytvor("span", "stitek", textZaKolik(test.dny));
    if (test.dny <= BRZY_DNI) stitek.classList.add("brzy");
    polozka.append(stitek);
    seznam.append(polozka);
  }
  sekce.append(seznam);
  return sekce;
}

function vytvorMaterialy(materialy) {
  const sekce = vytvor("section", "sekce");
  sekce.append(vytvor("h2", "", "Materiály"));

  if (materialy.length === 0) {
    sekce.append(
      vytvor("p", "karta slaby", "Zatím žádné materiály. Přidáš je do soukrome/skola/predmety.json do pole „materialy“.")
    );
    return sekce;
  }

  const seznam = vytvor("ul", "seznam");
  for (const material of materialy) {
    seznam.append(vytvorMaterial(material));
  }
  sekce.append(seznam);
  return sekce;
}

// Jeden materiál. Podle "typ" vypadá trochu jinak.
function vytvorMaterial(material) {
  const polozka = vytvor("li", "polozka material");
  polozka.append(vytvor("span", "material-typ", TYPY_MATERIALU[material.typ] || "Jiné"));
  const hlavni = vytvor("div", "polozka-hlavni");

  if (material.typ === "poznamka") {
    hlavni.append(vytvor("div", "polozka-nazev", material.nazev));
    hlavni.append(vytvor("div", "poznamka-text", material.text || ""));
  } else if (material.typ === "odkaz" || material.typ === "soubor") {
    const adresa = material.typ === "odkaz" ? material.url : material.cesta;
    const bezpecna = bezpecnaAdresa(adresa);
    if (bezpecna) {
      const odkaz = vytvor("a", "polozka-nazev", material.nazev);
      odkaz.href = bezpecna;
      if (material.typ === "odkaz") {
        odkaz.target = "_blank"; // otevře se v nové záložce
        odkaz.rel = "noopener";
      }
      hlavni.append(odkaz);
      hlavni.append(vytvor("div", "polozka-detail", popisAdresy(bezpecna, material.typ)));
    } else {
      hlavni.append(vytvor("div", "polozka-nazev", material.nazev));
      hlavni.append(vytvor("div", "chyba", "Chybná adresa: " + adresa));
    }
  } else {
    hlavni.append(vytvor("div", "polozka-nazev", material.nazev || "(bez názvu)"));
  }

  polozka.append(hlavni);
  return polozka;
}

// Pod odkazem ukážeme, kam vede: u webu doménu, u souboru jeho jméno.
function popisAdresy(adresa, typ) {
  const url = new URL(adresa, location.href);
  if (typ === "odkaz") return url.hostname.replace(/^www\./, "");
  return decodeURIComponent(url.pathname.split("/").pop());
}

function zobrazVsechnyPredmety(obsah, predmety, id) {
  obsah.append(vytvor("h1", "", "Předměty"));
  if (id) {
    obsah.append(vytvor("p", "chyba", `Předmět „${id}“ jsem nenašel. Vyber si ze seznamu:`));
  }
  const mrizka = vytvor("div", "mrizka");
  for (const predmet of Object.values(predmety)) {
    mrizka.append(vytvorDlazdici(predmet));
  }
  obsah.append(mrizka);
}

zobrazPredmet();
