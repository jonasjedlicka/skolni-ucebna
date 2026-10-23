// Modul ZPRÁVY: titulky z RSS kanálů.
// Data jsou v data/zpravy/ a plní je stahovani/zpravy.py přes GitHub Actions.

const ZPRAVY_DATA = "data/zpravy/";

// Kolik nejnovějších titulků ukázat na Přehledu
const POCET_ZPRAV_NA_PREHLEDU = 3;

async function nactiZpravy() {
  return nactiJson(ZPRAVY_DATA + "zpravy.json");
}

// Jedna zpráva. Text je z cizího webu, proto jen přes vytvor() (textContent)
// a odkaz jen přes bezpecnaAdresa().
function vytvorZpravu(zprava, sPerexem) {
  const polozka = vytvor("li", "polozka zprava");
  const hlavni = vytvor("div", "polozka-hlavni");

  const adresa = bezpecnaAdresa(zprava.odkaz);
  const titulek = vytvor(adresa ? "a" : "div", "polozka-nazev", zprava.titulek);
  if (adresa) {
    titulek.href = adresa;
    titulek.target = "_blank"; // článek se otevře v nové záložce
    titulek.rel = "noopener";
  }
  hlavni.append(titulek);

  if (sPerexem && zprava.perex) {
    hlavni.append(vytvor("div", "zprava-perex", zprava.perex));
  }
  hlavni.append(vytvor("div", "polozka-detail", `${zprava.zdroj} · ${textPredKolika(zprava.cas)}`));

  polozka.append(hlavni);
  return polozka;
}

// Dlaždice „Zprávy“ na Přehledu: jen pár nejnovějších titulků
async function vykresliZpravyDnes(obsah) {
  const zpravy = await nactiZpravy();
  const seznam = vytvor("ul", "seznam");
  for (const zprava of zpravy.slice(0, POCET_ZPRAV_NA_PREHLEDU)) {
    seznam.append(vytvorZpravu(zprava, false));
  }
  obsah.append(seznam);
}

MODULY.push({
  id: "zpravy",
  zalozka: "svet",
  maxStariHodin: 8, // stahují se každé 3 hodiny, víc než 8 h = něco se zaseklo
  obnova: { kazdychMinut: 30, zdroje: [ZPRAVY_DATA] },
  dnes: [{ nazev: "Zprávy", odkaz: "svet.html#zpravy", poradi: 5, vykresli: vykresliZpravyDnes }],
});
