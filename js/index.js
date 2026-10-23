// Přehled: to nejdůležitější na dnešek ze všech oblastí.
// Každý modul (js/moduly/…) nabízí v poli `dnes` své dlaždice a Přehled
// je jen posbírá, seřadí a vykreslí. Obsah dlaždice kreslí modul sám.
//
// Dlaždice: { nazev, odkaz, poradi, vysoka, vykresli(obsah, nadpis) }
// Když vykresli vrátí false, dlaždice se na Přehledu vůbec neukáže.
// Modul s „obnova“ dostane u dlaždice kolečko a čas aktualizace (js/obnova.js).

function zobrazPrehled() {
  zobrazDatum();
  document.getElementById("obnovit-vse").append(vytvorHlavniObnovu());

  const mrizka = document.getElementById("dnes");
  // flatMap: z každého modulu vezme jeho dlaždice (a k nim modul) do jednoho seznamu
  const dlazdice = MODULY.flatMap((modul) => (modul.dnes || []).map((d) => ({ ...d, modul })))
    .sort((a, b) => a.poradi - b.poradi);

  // Stav „aktualizováno“ ukážeme jen u první dlaždice každého modulu
  const seStavem = new Set();
  mrizka.replaceChildren(
    ...dlazdice.map((d, i) => {
      const ukazStav = !seStavem.has(d.modul.id);
      seStavem.add(d.modul.id);
      return vytvorDlazdiciPrehledu(d, i, ukazStav);
    })
  );
}

// „Pátek 23. října“
function zobrazDatum() {
  const text = new Date().toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" });
  document.getElementById("dnes-datum").textContent = text[0].toUpperCase() + text.slice(1);
}

function vytvorDlazdiciPrehledu(dlazdice, poradi, ukazStav) {
  const sekce = vytvor("section", "dlazdice-prehledu sklo vynorit");
  if (dlazdice.vysoka) sekce.classList.add("vysoka");
  sekce.style.setProperty("--poradi", poradi); // kvůli postupnému vynořování

  const hlavicka = vytvor("div", "dlazdice-hlavicka");
  const nadpis = vytvor("h2", "");
  // Odkaz v nadpisu se v CSS „roztáhne“ přes celou dlaždici (.cela-dlazdice::after),
  // takže kliknout jde kamkoli – vede do záložky dané oblasti
  const odkaz = vytvor("a", "cela-dlazdice", dlazdice.nazev);
  odkaz.href = dlazdice.odkaz;
  nadpis.append(odkaz);
  hlavicka.append(nadpis);

  const obsah = vytvor("div", "dlazdice-obsah");
  obsah.append(vytvor("p", "nacitani", "Načítá se…"));
  sekce.append(hlavicka, obsah);

  const vykresli = (novy) => dlazdice.vykresli(novy, odkaz);
  const obnova = dlazdice.modul.obnova;
  if (obnova) {
    // Widget s kolečkem: první načtení i každou další aktualizaci řídí js/obnova.js
    const misto = vytvor("span", "obnova");
    hlavicka.append(misto);
    zaregistrujObnovu({
      misto,
      kontejner: obsah,
      kazdychMinut: obnova.kazdychMinut,
      maxStariHodin: dlazdice.modul.maxStariHodin,
      obnov: vytvorObnovuDlazdice(dlazdice.modul, vykresli, obsah),
    });
  } else {
    if (ukazStav && dlazdice.modul.maxStariHodin) {
      const stav = vytvor("span", "stav");
      zobrazStav(stav, dlazdice.modul.id, dlazdice.modul.maxStariHodin);
      hlavicka.append(stav);
    }
    // Dlaždice se načítají každá zvlášť a nečekají na sebe,
    // takže pomalý zdroj nezdrží ostatní.
    vyplnObsah(vykresli, obsah);
  }
  return sekce;
}

// Co udělat při aktualizaci dlaždice:
// - data ze souborů / z API: zapomenout staré, znovu načíst a vykreslit;
//   když se to nepovede, stará data zůstanou (chyba se ukáže u kolečka)
// - zápisy (úkoly, poznámky…): jen znovu načíst ze serveru – dlaždice se
//   překreslí sama, protože poslouchá změny zápisů
function vytvorObnovuDlazdice(modul, vykresli, obsah) {
  let vykresleno = false;
  return async () => {
    if (modul.obnova.zapisy && vykresleno) {
      await zkontrolujZapisy(modul.obnova.zapisy, true);
      return new Date();
    }
    zapomenNactene([...(modul.obnova.zdroje || []), `data/${modul.id}/stav.json`]);
    const novy = vytvor("div", "");
    if ((await vykresli(novy)) === false) {
      obsah.closest(".dlazdice-prehledu").remove(); // dnes není co ukázat
      return null;
    }
    obsah.replaceChildren(...novy.childNodes);
    vykresleno = true;
    // U zápisů ještě počkáme na server – když synchronizace selže, ukáže se to u kolečka
    await zkontrolujZapisy(modul.obnova.zapisy || [], false);
    return modul.maxStariHodin ? casZeStavu(modul.id) : new Date();
  };
}

// Počká na načtení zápisů ze serveru (znovu = stáhnout znovu) a vyhodí chybu,
// když se synchronizace nepovedla
async function zkontrolujZapisy(nazvy, znovu) {
  for (const nazev of nazvy) {
    const zapisy = otevriZapisy(nazev);
    await (znovu ? zapisy.znovu() : zapisy.hotovo);
    const stav = zapisy.aktualniStav();
    if (stav.kod === "chyba" || stav.kod === "token") throw new Error(stav.text);
  }
}

async function vyplnObsah(vykresli, obsah) {
  try {
    const novy = vytvor("div", "");
    // Modul může vrátit false = dnes není co ukázat (např. žádné doučování) → dlaždici vynecháme
    if ((await vykresli(novy)) === false) {
      obsah.closest(".dlazdice-prehledu").remove();
      return;
    }
    obsah.replaceChildren(...novy.childNodes);
  } catch (chyba) {
    // Chyba jedné oblasti se ukáže jen v její dlaždici, ostatní fungují dál
    ukazChybu(obsah, chyba);
  }
}

zobrazPrehled();
