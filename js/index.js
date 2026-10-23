// Dashboard: každému modulu ze seznamu MODULY vytvoří kartu.
// Samotný obsah karty vykreslí modul (js/moduly/…), tady je jen rámeček.

async function zobrazDashboard() {
  const dashboard = document.getElementById("dashboard");
  dashboard.replaceChildren();
  for (const modul of MODULY) {
    dashboard.append(vytvorKartuModulu(modul));
  }
}

function vytvorKartuModulu(modul) {
  const karta = vytvor("section", "modul karta");
  if (modul.sirka === "plna") karta.classList.add("plna-sirka");

  const hlavicka = vytvor("div", "modul-hlavicka");
  const nadpis = vytvor("h2", "");
  const odkaz = vytvor("a", "", modul.nazev);
  odkaz.href = modul.odkaz;
  nadpis.append(odkaz);
  const stav = vytvor("span", "modul-stav slaby");
  hlavicka.append(nadpis, stav);

  const obsah = vytvor("div", "modul-obsah");
  obsah.append(vytvor("p", "nacitani", "Načítá se…"));
  karta.append(hlavicka, obsah);

  // Obsah a stav se načítají každý zvlášť a nečekáme na ně,
  // takže pomalý modul nezdrží ostatní.
  vyplnObsah(modul, obsah);
  vyplnStav(modul, stav);
  return karta;
}

async function vyplnObsah(modul, obsah) {
  try {
    const novy = vytvor("div", "");
    await modul.vykresli(novy);
    obsah.replaceChildren(...novy.childNodes);
  } catch (chyba) {
    // Chyba jednoho modulu se ukáže jen v jeho kartě, ostatní fungují dál
    ukazChybu(obsah, chyba);
  }
}

// Každý modul má v data/<id>/stav.json čas poslední úspěšné aktualizace.
// Když je moc starý, stahování se nejspíš zaseklo, tak to dáme najevo.
async function vyplnStav(modul, stav) {
  try {
    const { aktualizovano } = await nactiJson(`data/${modul.id}/stav.json`);
    stav.textContent = "aktualizováno " + textPredKolika(aktualizovano);
    const hodin = (Date.now() - new Date(aktualizovano)) / 3600000;
    if (hodin > modul.maxStariHodin) {
      stav.classList.add("zastarale");
      stav.textContent += " ⚠️";
      stav.title = "Data se dlouho neaktualizovala. Zkontroluj stahovací skript.";
    }
  } catch {
    stav.textContent = "";
  }
}

zobrazDashboard();
