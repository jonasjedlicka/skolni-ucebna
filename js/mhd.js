// Část MHD v záložce Svět: odjezdy ze všech tvých zastávek.
// Načítání a vzhled odjezdu jsou v js/moduly/mhd.js.

const MHD_ODJEZDU_NA_ZASTAVKU = 10;

async function zobrazMhd() {
  const obsah = document.getElementById("mhd");
  try {
    const nastaveni = await nactiNastaveniMhd();
    if (!nastaveni) {
      obsah.replaceChildren(vytvor("p", "slaby",
        "MHD ještě není nastavené: v Terminálu spusť .venv/bin/python stahovani/mhd.py (návod je na začátku souboru)."));
      return;
    }
    obsah.replaceChildren(...nastaveni.zastavky.map((zastavka) => vytvorZastavku(zastavka, nastaveni.klic)));
  } catch (chyba) {
    ukazChybu(obsah, chyba);
  }
}

// Karta jedné zastávky: nadpis, čas posledního stažení a seznam odjezdů
function vytvorZastavku(zastavka, klic) {
  const karta = vytvor("div", "karta sekce");
  const hlavicka = vytvor("div", "dlazdice-hlavicka");
  hlavicka.append(vytvor("h2", "", zastavka.popis ? `${zastavka.nazev} · ${zastavka.popis}` : zastavka.nazev));
  const stav = vytvor("span", "stav");
  hlavicka.append(stav);
  const seznam = vytvor("ul", "seznam");
  seznam.append(vytvor("li", "nacitani", "Načítá se…"));
  karta.append(hlavicka, seznam);
  if (zastavka.chuze) karta.append(vytvor("p", "polozka-detail", `Cesta na zastávku ${zastavka.chuze} min – spoje, které nestihneš, jsou schované.`));

  let stazeno = null;
  obnovujOdjezdy(
    seznam,
    async () => {
      const odjezdy = await nactiOdjezdy(zastavka, klic);
      stazeno = new Date();
      return odjezdy;
    },
    (odjezdy, chyba) => {
      if (chyba) {
        stav.textContent = chyba.message;
        stav.classList.add("zastarale");
        return;
      }
      stav.classList.remove("zastarale");
      stav.textContent = "aktualizováno " + stazeno.toLocaleTimeString("cs-CZ");
      const dalsi = stihnutelne(odjezdy, zastavka).slice(0, MHD_ODJEZDU_NA_ZASTAVKU);
      seznam.replaceChildren(...(dalsi.length ? dalsi.map((o) => vytvorOdjezd(o, zastavka)) : [vytvor("li", "slaby", "V příštích 90 minutách nic nejede.")]));
    }
  );
  return karta;
}

zobrazMhd();
