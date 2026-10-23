// Modul TRÉNINK: zápis cviků (váha × opakování), plán na každý den v týdnu
// a progres. Ukládá se zašifrovaně na GitHub (js/zapisy.js). Položky:
//   série: { druh: "serie", datum, cvik, vaha (kg, 0 = vlastní váha), opakovani, cas }
//   plán:  id "plan-<0–6>", { druh: "plan", den, cviky: [{ cvik, serie, opakovani }] }
// Každá série je samostatná položka, takže zápis z mobilu a z počítače se nepřepíše.

function treninkZapisy() {
  return otevriZapisy("trenink", "trénink");
}

function vsechnySerie() {
  return treninkZapisy()
    .polozky()
    .filter((p) => p.druh === "serie")
    .sort((a, b) => a.cas - b.cas);
}

function serieDne(datum) {
  return vsechnySerie().filter((s) => s.datum === datum);
}

// Plán na den v týdnu (0 = pondělí); bez plánu prázdný seznam
function planDne(den) {
  return treninkZapisy().polozky().find((p) => p.id === "plan-" + den)?.cviky || [];
}

function dnesniPlan() {
  return planDne(denVTydnu(new Date()));
}

// Názvy všech cviků (ze zápisů i z plánu) pro našeptávač
function nazvyCviku() {
  const polozky = treninkZapisy().polozky();
  const nazvy = [
    ...polozky.filter((p) => p.druh === "serie").map((p) => p.cvik),
    ...polozky.filter((p) => p.druh === "plan").flatMap((p) => p.cviky.map((c) => c.cvik)),
  ];
  return [...new Set(nazvy)].sort((a, b) => a.localeCompare(b, "cs"));
}

// „60 kg × 8“ nebo „× 12“ (vlastní váha)
function textZapisuSerie(s) {
  return s.vaha ? `${cisloKg(s.vaha)} kg × ${s.opakovani}` : `× ${s.opakovani}`;
}

function cisloKg(kg) {
  return Number(kg).toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
}

// Poslední trénink daného cviku před dneškem: jeho série (kvůli „minule“)
function minuleSerie(cvik) {
  const dnes = datumKlic();
  const starsi = vsechnySerie().filter((s) => s.cvik === cvik && s.datum < dnes);
  if (!starsi.length) return [];
  const posledniDen = starsi.at(-1).datum;
  return starsi.filter((s) => s.datum === posledniDen);
}

// Progres cviku po dnech: nejtěžší série dne (u vlastní váhy nejvíc opakování)
function progresCviku(cvik) {
  const dny = new Map();
  for (const s of vsechnySerie().filter((s) => s.cvik === cvik)) {
    const nejlepsi = dny.get(s.datum);
    const lepsi = !nejlepsi || s.vaha > nejlepsi.vaha || (s.vaha === nejlepsi.vaha && s.opakovani > nejlepsi.opakovani);
    if (lepsi) dny.set(s.datum, s);
  }
  return [...dny.values()].sort((a, b) => a.datum.localeCompare(b.datum));
}

// Dlaždice „Trénink na dnes“ na Přehledu: dnešní plán a kolik sérií je hotových.
// Bez plánu i bez zápisu na dnešek se dlaždice neukáže (volný den).
async function vykresliTreninkDnes(obsah) {
  await treninkZapisy().hotovo;
  const dnes = datumKlic();
  if (dnesniPlan().length === 0 && serieDne(dnes).length === 0) return false;

  const seznam = vytvor("ul", "seznam");
  obsah.append(seznam);
  function prekresli() {
    const plan = dnesniPlan();
    const hotove = serieDne(dnes);
    const cviky = plan.length ? plan : [...new Set(hotove.map((s) => s.cvik))].map((cvik) => ({ cvik }));
    seznam.replaceChildren(...cviky.map((c) => vytvorRadekCvikuDnes(c, hotove)));
  }
  treninkZapisy().naZmenu(prekresli);
  prekresli();
}

// Řádek cviku pro dnešek: název, cíl z plánu, hotové série a „minule“
function vytvorRadekCvikuDnes(c, hotoveDnes) {
  const polozka = vytvor("li", "polozka cvik-dnes");
  const hotove = hotoveDnes.filter((s) => s.cvik === c.cvik);
  const hlavni = vytvor("div", "polozka-hlavni");
  hlavni.append(vytvor("div", "polozka-nazev", c.cvik));
  const detail = [];
  if (c.serie) detail.push(`plán ${c.serie} × ${c.opakovani || "?"}`);
  if (hotove.length) detail.push("dnes " + hotove.map(textZapisuSerie).join(", "));
  else {
    const minule = minuleSerie(c.cvik);
    if (minule.length) detail.push("minule " + minule.map(textZapisuSerie).join(", "));
  }
  hlavni.append(vytvor("div", "polozka-detail", detail.join(" · ") || "zatím nezapsáno"));
  polozka.append(hlavni);
  if (c.serie) {
    const stitek = vytvor("span", "stitek", `${Math.min(hotove.length, c.serie)}/${c.serie}`);
    if (hotove.length >= c.serie) stitek.classList.add("brzy"); // hotovo
    polozka.append(stitek);
  }
  return polozka;
}

MODULY.push({
  id: "trenink",
  zalozka: "zdravi",
  dnes: [{ nazev: "Trénink na dnes", odkaz: "zdravi.html#trenink", poradi: 2.8, vykresli: vykresliTreninkDnes }],
});
