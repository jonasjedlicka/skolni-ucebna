// Modul NÁVYKY: denní návyky a kolik dní v řadě je plníš.
// Ukládá se zašifrovaně na GitHub (js/zapisy.js). Dva druhy položek:
//   návyk:   { druh: "navyk", nazev, dny: [0–6], vytvoreno }   (0 = pondělí … 6 = neděle)
//   splnění: id "s-<id návyku>-<datum>", { druh: "splneno", navyk, datum }
// Každé odškrtnutí je samostatná položka, takže se odškrtávání z mobilu
// a z počítače nikdy nepřepíše.

const NAZVY_DNU = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const VSECHNY_DNY = [0, 1, 2, 3, 4, 5, 6];
const NAVYKY_HISTORIE_DNI = 400; // jak daleko zpátky počítáme sérii

function navykyZapisy() {
  return otevriZapisy("navyky", "návyky");
}

function seznamNavyku() {
  return navykyZapisy()
    .polozky()
    .filter((p) => p.druh === "navyk")
    .sort((a, b) => a.vytvoreno - b.vytvoreno);
}

function maNaplanovano(navyk, datum) {
  return (navyk.dny || VSECHNY_DNY).includes(denVTydnu(datum));
}

function idSplneni(navyk, datum) {
  return `s-${navyk.id}-${datumKlic(datum)}`;
}

// Množina dat ("2026-10-23"), kdy byl návyk splněný
function splneneDny(navyk) {
  return new Set(
    navykyZapisy()
      .polozky()
      .filter((p) => p.druh === "splneno" && p.navyk === navyk.id)
      .map((p) => p.datum)
  );
}

function jeSplneno(navyk, datum) {
  return splneneDny(navyk).has(datumKlic(datum));
}

function prepniSplneni(navyk, datum) {
  const id = idSplneni(navyk, datum);
  if (jeSplneno(navyk, datum)) navykyZapisy().smaz(id);
  else navykyZapisy().uloz({ id, druh: "splneno", navyk: navyk.id, datum: datumKlic(datum) });
}

// Den o n dní zpátky (0 = dnes)
function predDny(n) {
  const datum = new Date();
  datum.setHours(12, 0, 0, 0); // poledne – změna času na zimní/letní nic nerozhodí
  datum.setDate(datum.getDate() - n);
  return datum;
}

// Série: kolik naplánovaných dní v řadě je splněno. Dny, kdy návyk naplánovaný
// není, sérii nepřeruší. Dnešek sérii nepřeruší, dokud den neskončí.
// Vrátí { aktualni, nejdelsi }.
function serieNavyku(navyk) {
  const splneno = splneneDny(navyk);
  let aktualni = 0;
  let pocitam = true; // aktuální série ještě nebyla přerušená
  let bezici = 0;
  let nejdelsi = 0;
  // Od nejstaršího dne k dnešku kvůli nejdelší sérii, aktuální počítáme zvlášť
  for (let n = NAVYKY_HISTORIE_DNI; n >= 0; n--) {
    const den = predDny(n);
    if (!maNaplanovano(navyk, den)) continue;
    if (splneno.has(datumKlic(den))) {
      bezici++;
      nejdelsi = Math.max(nejdelsi, bezici);
    } else if (n > 0) {
      bezici = 0;
    }
  }
  for (let n = 0; n <= NAVYKY_HISTORIE_DNI && pocitam; n++) {
    const den = predDny(n);
    if (!maNaplanovano(navyk, den)) continue;
    if (splneno.has(datumKlic(den))) aktualni++;
    else if (n > 0) pocitam = false; // nesplněný den v minulosti = konec série
  }
  return { aktualni, nejdelsi };
}

// „1 den“, „2 dny“, „5 dní“
function textDni(pocet) {
  if (pocet === 1) return "1 den";
  if (pocet >= 2 && pocet <= 4) return `${pocet} dny`;
  return `${pocet} dní`;
}

function textSerie(serie) {
  if (serie.aktualni === 0) return serie.nejdelsi ? `nejdelší série ${textDni(serie.nejdelsi)}` : "zatím žádná série";
  return `${textDni(serie.aktualni)} v řadě`;
}

// Řádek návyku: zaškrtávátko pro dnešek, název a série.
// znacka: "li" v seznamu, "div" když je řádek součástí větší karty (stránka Zdraví)
function vytvorRadekNavyku(navyk, znacka = "li") {
  const dnes = new Date();
  const naplanovano = maNaplanovano(navyk, dnes);
  const splneno = jeSplneno(navyk, dnes);
  const polozka = vytvor(znacka, "polozka navyk");
  if (!naplanovano) polozka.classList.add("volno");

  const zaskrtnout = vytvor("button", "zaskrtavatko");
  zaskrtnout.type = "button";
  zaskrtnout.setAttribute("role", "checkbox");
  zaskrtnout.setAttribute("aria-checked", splneno);
  zaskrtnout.setAttribute("aria-label", `${navyk.nazev} – dnes splněno`);
  zaskrtnout.addEventListener("click", () => prepniSplneni(navyk, dnes));
  polozka.append(zaskrtnout);

  const hlavni = vytvor("div", "polozka-hlavni");
  hlavni.append(vytvor("div", "polozka-nazev", navyk.nazev));
  const serie = serieNavyku(navyk);
  const detail = [textSerie(serie)];
  if (!naplanovano) detail.unshift("dnes volno");
  hlavni.append(vytvor("div", "polozka-detail", detail.join(" · ")));
  polozka.append(hlavni);

  // Výrazné číslo série vpravo (od 2 dní)
  if (serie.aktualni >= 2) {
    const stitek = vytvor("span", "stitek", textDni(serie.aktualni));
    if (serie.aktualni >= 7) stitek.classList.add("brzy"); // týden a víc: bílý štítek
    polozka.append(stitek);
  }
  return polozka;
}

// Dlaždice „Návyky“ na Přehledu: dnešní návyky k odškrtnutí
function vykresliNavykyDnes(obsah) {
  const souhrn = vytvor("p", "polozka-detail");
  const seznam = vytvor("ul", "seznam");
  obsah.append(seznam, souhrn);

  function prekresli() {
    const dnes = new Date();
    const dnesni = seznamNavyku().filter((n) => maNaplanovano(n, dnes));
    if (dnesni.length === 0) {
      seznam.replaceChildren(vytvor("li", "slaby", seznamNavyku().length ? "Dnes žádné návyky." : "Zatím žádné návyky – přidej je ve Zdraví."));
      souhrn.textContent = "";
      return;
    }
    seznam.replaceChildren(...dnesni.map((navyk) => vytvorRadekNavyku(navyk)));
    const hotovo = dnesni.filter((n) => jeSplneno(n, dnes)).length;
    souhrn.textContent = hotovo === dnesni.length ? "Dnes máš všechno splněno." : `Dnes splněno ${hotovo} z ${dnesni.length}`;
  }
  navykyZapisy().naZmenu(prekresli);
  prekresli();
}

MODULY.push({
  id: "navyky",
  zalozka: "zdravi",
  dnes: [{ nazev: "Návyky", odkaz: "zdravi.html#navyky", poradi: 2.7, vykresli: vykresliNavykyDnes }],
});
