// Modul ZNÁMKY: známky po předmětech, vážené průměry a „co potřebuju dostat“.
// Zatím se zadávají ručně; ukládají se zašifrovaně na GitHub (js/zapisy.js).
// Známka: { druh: "znamka", predmet (id z predmety.json), hodnota 1–5 (1,5 = „1-“),
//           vaha (např. 1 zkoušení, 2 test), popis?, datum "2026-10-23" }
//
// Vážený průměr = součet (známka × váha) / součet vah.
// Celkový průměr = obyčejný průměr vážených průměrů předmětů (každý předmět má stejnou váhu).

const HODNOTY_ZNAMEK = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

function znamkyZapisy() {
  return otevriZapisy("znamky", "známky");
}

// 1.5 → „1-“, 2 → „2“
function textZnamky(hodnota) {
  return Number.isInteger(hodnota) ? String(hodnota) : `${Math.floor(hodnota)}-`;
}

// 1,4567 → „1,46“
function textPrumeru(prumer) {
  return prumer === null ? "–" : prumer.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Pololetí podle data: září–leden = 1., únor–červen = 2. (prázdniny počítáme k 2.)
// Vrátí klíč "2026/27-1".
function pololetiZnamky(datum) {
  const d = parsujDatum(datum);
  const mesic = d.getMonth() + 1;
  const rokZacatku = mesic >= 9 ? d.getFullYear() : d.getFullYear() - 1;
  const rok = `${rokZacatku}/${String(rokZacatku + 1).slice(2)}`;
  return `${rok}-${mesic >= 9 || mesic === 1 ? 1 : 2}`;
}

function aktualniPololeti() {
  return pololetiZnamky(datumKlic());
}

function textPololeti(klic) {
  const [rok, cislo] = klic.split("-");
  return `${cislo}. pololetí ${rok}`;
}

// Známky ve vybraném období: klíč pololetí, "rok:2026/27", nebo null = všechny
function znamkyVObdobi(obdobi) {
  return znamkyZapisy()
    .polozky()
    .filter((z) => z.druh === "znamka")
    .filter((z) => {
      if (!obdobi) return true;
      if (obdobi.startsWith("rok:")) return pololetiZnamky(z.datum).startsWith(obdobi.slice(4));
      return pololetiZnamky(z.datum) === obdobi;
    })
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.zmeneno - b.zmeneno);
}

// Průměry jednoho předmětu: { vazeny, aritmeticky, soucet (Σ známka×váha), vahy (Σ váha) }
function prumeryZnamek(znamky) {
  if (znamky.length === 0) return { vazeny: null, aritmeticky: null, soucet: 0, vahy: 0 };
  const soucet = znamky.reduce((s, z) => s + z.hodnota * z.vaha, 0);
  const vahy = znamky.reduce((s, z) => s + z.vaha, 0);
  const aritmeticky = znamky.reduce((s, z) => s + z.hodnota, 0) / znamky.length;
  return { vazeny: vahy ? soucet / vahy : null, aritmeticky, soucet, vahy };
}

// Předměty se známkami: [{ predmet, znamky, ...prumery }], od nejhoršího průměru
function predmetySeZnamkami(obdobi) {
  const podlePredmetu = new Map();
  for (const z of znamkyVObdobi(obdobi)) {
    if (!podlePredmetu.has(z.predmet)) podlePredmetu.set(z.predmet, []);
    podlePredmetu.get(z.predmet).push(z);
  }
  return [...podlePredmetu].map(([predmet, znamky]) => ({ predmet, znamky, ...prumeryZnamek(znamky) }));
}

function celkovyPrumer(predmety) {
  const prumery = predmety.map((p) => p.vazeny).filter((p) => p !== null);
  return prumery.length ? prumery.reduce((a, b) => a + b, 0) / prumery.length : null;
}

// „Co potřebuju dostat“: jakou známku s danou vahou, aby vážený průměr byl
// nejvýš cil. Vrátí objekt s textem (a číslem potřebné známky).
function coPotrebuju(prumery, cil, vaha) {
  const { soucet, vahy, vazeny } = prumery;
  if (!(cil >= 1 && cil <= 5) || !(vaha > 0)) return { text: "Zadej cílový průměr 1–5 a váhu." };
  // Rovnice: (soucet + x·vaha) / (vahy + vaha) = cil  →  x = (cil·(vahy+vaha) − soucet) / vaha
  const potreba = (cil * (vahy + vaha) - soucet) / vaha;
  if (potreba >= 5) {
    return { text: vazeny !== null && vazeny <= cil ? `Průměr ${textPrumeru(cil)} udržíš, i kdybys dostal pětku.` : "Stačí jakákoli známka." };
  }
  if (potreba >= 1) {
    // Nejhorší známka ze stupnice, která ještě stačí (menší číslo = lepší)
    const stacit = [...HODNOTY_ZNAMEK].reverse().find((h) => h <= potreba + 1e-9);
    return {
      potreba,
      text: `Potřebuješ aspoň ${textPrumeru(potreba)} – tedy ${textZnamky(stacit)} nebo lepší.`,
    };
  }
  // Ani jednička nestačí – kolik jedniček s touto vahou je potřeba?
  if (cil <= 1) return { text: "Průměr 1,00 už jde jen se samými jedničkami – a s dosavadními známkami to nejde." };
  const jednicek = Math.ceil((soucet - cil * vahy) / (vaha * (cil - 1)) - 1e-9);
  return { text: `Jednou známkou to nedáš. Potřebuješ ${jednicek}× jedničku s vahou ${vaha}.` };
}

// Dlaždice „Známky“ na Přehledu: celkový průměr a předmět, kde je to nejhorší
async function vykresliZnamkyDnes(obsah) {
  const [predmety] = await Promise.all([predmetyProUkoly(), znamkyZapisy().hotovo]);
  const misto = vytvor("div", "");
  obsah.append(misto);
  function prekresli() {
    const obdobi = aktualniPololeti();
    const seznam = predmetySeZnamkami(obdobi);
    if (seznam.length === 0) {
      misto.replaceChildren(vytvor("p", "slaby", "Zatím žádné známky v tomhle pololetí – přidej je ve Škole."));
      return;
    }
    const celkem = celkovyPrumer(seznam);
    const nejhorsi = seznam.reduce((a, b) => (b.vazeny > a.vazeny ? b : a));
    misto.replaceChildren(
      vytvor("div", "odpocet", textPrumeru(celkem)),
      vytvor("p", "polozka-detail", `celkový průměr · ${textPololeti(obdobi)}`)
    );
    const radek = vytvor("p", "znamky-nejhorsi");
    radek.append("Nejhorší: ", vytvor("strong", "", predmety[nejhorsi.predmet]?.nazev || nejhorsi.predmet), ` (${textPrumeru(nejhorsi.vazeny)})`);
    misto.append(radek);
  }
  znamkyZapisy().naZmenu(prekresli);
  prekresli();
}

MODULY.push({
  id: "znamky",
  zalozka: "skola",
  obnova: { kazdychMinut: 10, zapisy: ["znamky"] },
  dnes: [{ nazev: "Známky", odkaz: "skola.html#znamky", poradi: 2.1, vykresli: vykresliZnamkyDnes }],
});
