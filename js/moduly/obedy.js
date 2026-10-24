// Modul OBĚDY: jídelníček z e-jidelnicek.cz, co je objednané (vybírá se nutričně
// lepší menu) a upozornění, když se páteční objednání nepovedlo. Data stahuje a obědy objednává
// stahovani/obedy.py na Macu (~/Dashboard-data/obedy/).
// Oblíbená a neoblíbená jídla se ukládají jako zápisy „obedy“:
//   { druh: "oblibene" | "neoblibene", slovo }

const OBEDY_DATA = "data/obedy/";

function obedyZapisy() {
  return otevriZapisy("obedy");
}

async function nactiJidelnicek() {
  return (await nactiJson(OBEDY_DATA + "jidelnicek.json")).dny;
}

// Výsledek posledního objednávání; když ještě nikdy neproběhlo, null
async function nactiObjednavku() {
  try {
    return await nactiJson(OBEDY_DATA + "objednavka.json");
  } catch {
    return null;
  }
}

// Stejný výpočet jako v stahovani/obedy.py: rozhoduje nutriční skóre (spočítá ho
// skript a uloží k jídlu jako „nutri“), neoblíbené −100, oblíbené +0,1 (jen při shodě)
function bezDiakritiky(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function preferenceObedu() {
  const vysledek = { oblibene: [], neoblibene: [] };
  for (const p of obedyZapisy().polozky()) {
    if (vysledek[p.druh] && p.slovo) vysledek[p.druh].push(bezDiakritiky(p.slovo));
  }
  return vysledek;
}

function skoreJidla(jidlo, preference) {
  const text = bezDiakritiky(jidlo.nazev);
  const oblibene = 0.1 * preference.oblibene.filter((s) => text.includes(s)).length;
  const neoblibene = 100 * preference.neoblibene.filter((s) => text.includes(s)).length;
  return (jidlo.nutri?.skore || 0) + oblibene - neoblibene;
}

// „nutričně +3 (zelenina +2, šetrná úprava +1)“
function textNutri(jidlo) {
  if (!jidlo.nutri) return "";
  const { skore, duvody } = jidlo.nutri;
  return `nutričně ${skore > 0 ? "+" : ""}${skore}` + (duvody.length ? ` (${duvody.join(", ")})` : "");
}

// Menu dne, které by skript vybral (při shodě nechá objednané, jinak první)
function vybraneMenu(den, preference) {
  const menu = den.jidla.filter((j) => j.druh.toLowerCase().startsWith("menu"));
  if (menu.length === 0) return null;
  return menu.reduce((nejlepsi, m) => {
    const a = skoreJidla(nejlepsi, preference);
    const b = skoreJidla(m, preference);
    return b > a || (b === a && m.objednano && !nejlepsi.objednano) ? m : nejlepsi;
  });
}

// Upozornění k objednávání – co se nepovedlo nebo čeká (texty pro dashboard)
function upozorneniObedu(objednavka) {
  if (!objednavka) return [];
  const upozorneni = [];
  if (objednavka.chyba && (!objednavka.cas || objednavka.chyba_cas >= objednavka.cas)) {
    upozorneni.push(`Objednávání obědů selhalo: ${objednavka.chyba}`);
  }
  for (const den of objednavka.dny || []) {
    if (den.datum < datumKlic()) continue; // ten den už minul – nemá smysl upozorňovat
    const kdy = parsujDatum(den.datum).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" });
    if (den.zmeskano) upozorneni.push(`${kdy}: uzávěrka už prošla, ${den.menu} se objednat nestihlo.`);
    else if (den.chyba) upozorneni.push(`${kdy}: ${den.chyba}`);
  }
  if (objednavka.stav === "ceka-na-jidelnicek") upozorneni.push("Jídelníček na příští týden ještě není zveřejněný – zkusím to každou hodinu znovu.");
  return upozorneni;
}

// Objednané jídlo dne: polévka + menu (to, co má zapnutý přepínač)
function objednaneJidlo(den) {
  return den.jidla.filter((j) => j.objednano && !/zákusek|nápoj/i.test(j.druh));
}

// Dlaždice „Oběd“ na Přehledu: nejbližší den s objednaným obědem + upozornění
async function vykresliObedDnes(obsah, nadpis) {
  const [dny, objednavka] = await Promise.all([nactiJidelnicek(), nactiObjednavku()]);
  const dnes = datumKlic();
  const den = dny.find((d) => d.datum >= dnes && objednaneJidlo(d).length);

  for (const text of upozorneniObedu(objednavka)) obsah.append(vytvor("p", "pocasi-varovani obed-varovani", text));
  if (!den) {
    obsah.append(vytvor("p", "slaby", "Žádný objednaný oběd v nejbližších dnech."));
    return;
  }
  if (den.datum !== dnes) {
    const kdy = parsujDatum(den.datum).toLocaleDateString("cs-CZ", { weekday: "long" });
    nadpis.textContent = `Oběd ${dnyDo(parsujDatum(den.datum)) === 1 ? "zítra" : "– " + kdy}`;
  }
  const seznam = vytvor("ul", "seznam");
  seznam.style.marginTop = "6px";
  for (const jidlo of objednaneJidlo(den)) {
    const polozka = vytvor("li", "polozka");
    const hlavni = vytvor("div", "polozka-hlavni");
    hlavni.append(vytvor("div", "polozka-nazev", jidlo.nazev), vytvor("div", "polozka-detail", jidlo.druh));
    polozka.append(hlavni);
    seznam.append(polozka);
  }
  obsah.append(seznam);
}

MODULY.push({
  id: "obedy",
  zalozka: "skola",
  maxStariHodin: 24, // jídelníček se obnovuje každých 6 h, když Mac nespí
  obnova: { kazdychMinut: 60, zdroje: [OBEDY_DATA] },
  dnes: [{ nazev: "Oběd dnes", odkaz: "skola.html#obedy", poradi: 1.3, vykresli: vykresliObedDnes }],
});
