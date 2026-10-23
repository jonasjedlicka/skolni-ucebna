// Dashboard: nahoře sekce „Dnes“ s tím nejdůležitějším, pod ní karty modulů.
// Obsah dlaždic a karet vykreslují moduly (js/moduly/…), tady je jen rozložení.
//
// Modul se přihlásí do MODULY (viz spolecne.js) a může nabídnout:
//   vykresli(obsah)              – obsah své karty v mřížce modulů
//   dnes: [{ nazev, poradi, vysoka, vykresli(obsah, nadpis) }]
//                                – dlaždice do sekce „Dnes“

function zobrazDashboard() {
  zobrazDatum();
  zobrazDnes();
  zobrazModuly();
}

// „Pátek 23. října“
function zobrazDatum() {
  const text = new Date().toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" });
  document.getElementById("dnes-datum").textContent = text[0].toUpperCase() + text.slice(1);
}

function zobrazDnes() {
  const mrizka = document.getElementById("dnes");
  // flatMap: z každého modulu vezme jeho dlaždice a udělá z nich jeden seznam
  const dlazdice = MODULY.flatMap((modul) => modul.dnes || []).sort((a, b) => a.poradi - b.poradi);
  mrizka.replaceChildren(...dlazdice.map((d, i) => vytvorDlazdiciDnes(d, i)));
}

function vytvorDlazdiciDnes(dlazdice, poradi) {
  const sekce = vytvor("section", "dnes-dlazdice sklo vynorit");
  if (dlazdice.vysoka) sekce.classList.add("vysoka");
  sekce.style.setProperty("--poradi", poradi); // kvůli postupnému vynořování

  const nadpis = vytvor("h2", "", dlazdice.nazev);
  const obsah = vytvor("div", "");
  obsah.append(vytvor("p", "nacitani", "Načítá se…"));
  sekce.append(nadpis, obsah);

  vyplnObsah((novy) => dlazdice.vykresli(novy, nadpis), obsah);
  return sekce;
}

function zobrazModuly() {
  const dashboard = document.getElementById("dashboard");
  // Karty modulů přijdou až po dlaždicích „Dnes“, proto pořadí posuneme
  const posun = MODULY.flatMap((modul) => modul.dnes || []).length;
  dashboard.replaceChildren(...MODULY.map((modul, i) => vytvorKartuModulu(modul, posun + i)));
}

function vytvorKartuModulu(modul, poradi) {
  const karta = vytvor("section", "modul sklo vynorit");
  if (modul.sirka === "plna") karta.classList.add("plna-sirka");
  karta.style.setProperty("--poradi", poradi);

  const hlavicka = vytvor("div", "modul-hlavicka");
  const nadpis = vytvor("h2", "");
  // Odkaz v nadpisu se v CSS „roztáhne“ přes celou kartu (.modul-odkaz::after),
  // takže kliknout jde kamkoli na kartu
  const odkaz = vytvor("a", "modul-odkaz", modul.nazev);
  odkaz.href = modul.odkaz;
  nadpis.append(odkaz);
  const stav = vytvor("span", "modul-stav slaby");
  hlavicka.append(nadpis, stav);

  const obsah = vytvor("div", "modul-obsah");
  obsah.append(vytvor("p", "nacitani", "Načítá se…"));
  karta.append(hlavicka, obsah);

  // Obsah a stav se načítají každý zvlášť a nečekáme na ně,
  // takže pomalý modul nezdrží ostatní.
  vyplnObsah(modul.vykresli, obsah);
  vyplnStav(modul, stav);
  return karta;
}

async function vyplnObsah(vykresli, obsah) {
  try {
    const novy = vytvor("div", "");
    await vykresli(novy);
    obsah.replaceChildren(...novy.childNodes);
  } catch (chyba) {
    // Chyba jednoho modulu se ukáže jen v jeho kartě, ostatní fungují dál
    ukazChybu(obsah, chyba);
  }
}

// Každý modul má v data/<id>/stav.json čas poslední aktualizace.
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
