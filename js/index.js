// Přehled: to nejdůležitější na dnešek ze všech oblastí.
// Každý modul (js/moduly/…) nabízí v poli `dnes` své dlaždice a Přehled
// je jen posbírá, seřadí a vykreslí. Obsah dlaždice kreslí modul sám.
//
// Dlaždice: { nazev, odkaz, poradi, vysoka, vykresli(obsah, nadpis) }

function zobrazPrehled() {
  zobrazDatum();

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

  if (ukazStav) {
    const stav = vytvor("span", "stav");
    zobrazStav(stav, dlazdice.modul.id, dlazdice.modul.maxStariHodin);
    hlavicka.append(stav);
  }

  const obsah = vytvor("div", "dlazdice-obsah");
  obsah.append(vytvor("p", "nacitani", "Načítá se…"));
  sekce.append(hlavicka, obsah);

  // Dlaždice se načítají každá zvlášť a nečekají na sebe,
  // takže pomalý zdroj nezdrží ostatní.
  vyplnObsah((novy) => dlazdice.vykresli(novy, odkaz), obsah);
  return sekce;
}

async function vyplnObsah(vykresli, obsah) {
  try {
    const novy = vytvor("div", "");
    await vykresli(novy);
    obsah.replaceChildren(...novy.childNodes);
  } catch (chyba) {
    // Chyba jedné oblasti se ukáže jen v její dlaždici, ostatní fungují dál
    ukazChybu(obsah, chyba);
  }
}

zobrazPrehled();
