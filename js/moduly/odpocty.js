// Modul ODPOČTY: kolik dní zbývá do prázdnin, maturity, testů a vlastních událostí.
// Tři zdroje:
//   1. pevné termíny školního roku (níž v ODPOCTY_SKOLNI_ROK, z MŠMT – veřejné),
//   2. testy ze školních dat (Edookit, zašifrované),
//   3. vlastní odpočty, které si přidáš na stránce Plán → Odpočty
//      (ukládají se zašifrovaně na GitHub přes js/zapisy.js).

const ODPOCTY_KLIC = "ucebna-odpocty"; // starý zápis v prohlížeči (jen kvůli převodu)

// Školní rok 2026/27 podle MŠMT. „do“ = poslední den (včetně).
// Jarní prázdniny se v Praze liší podle obvodu: Praha 1–5 má 22.–28. 2.,
// Praha 6–10 má 1.–7. 3. 2027.
const ODPOCTY_SKOLNI_ROK = [
  { id: "podzimni-2026", nazev: "Podzimní prázdniny", od: "2026-10-29", do: "2026-10-30", typ: "Prázdniny" },
  { id: "vanocni-2026", nazev: "Vánoční prázdniny", od: "2026-12-23", do: "2027-01-03", typ: "Prázdniny" },
  { id: "vysvedceni-2027-01", nazev: "Pololetní vysvědčení", od: "2027-01-28", typ: "Škola" },
  { id: "pololetni-2027", nazev: "Pololetní prázdniny", od: "2027-01-29", typ: "Prázdniny" },
  { id: "jarni-2027", nazev: "Jarní prázdniny", od: "2027-02-22", do: "2027-02-28", typ: "Prázdniny", poznamka: "Praha 1–5" },
  { id: "velikonocni-2027", nazev: "Velikonoční prázdniny", od: "2027-03-25", do: "2027-03-29", typ: "Prázdniny" },
  {
    id: "maturita-2027", nazev: "Maturita – didaktické testy", od: "2027-05-03", typ: "Škola",
    poznamka: "předběžně: testy bývají 2.–15. 5., přesné dny vyhlásí MŠMT",
  },
  { id: "konec-roku-2027", nazev: "Konec školního roku", od: "2027-06-30", typ: "Škola" },
  { id: "letni-2027", nazev: "Letní prázdniny", od: "2027-07-01", do: "2027-08-31", typ: "Prázdniny" },
];

// --- Uložené: vlastní odpočty a skryté pevné termíny ---
// Ukládají se zašifrovaně na GitHub (js/zapisy.js), takže jsou všude stejné.
// Položky: vlastní { druh: "vlastni", nazev, od, do? }, skrytý pevný termín
// má id "skryte-<id termínu>" a { druh: "skryte" }.

function odpoctyZapisy() {
  return otevriZapisy("odpocty", "odpočty");
}

function nactiUlozeneOdpocty() {
  const polozky = odpoctyZapisy().polozky();
  return {
    vlastni: polozky.filter((p) => p.druh === "vlastni"),
    skryte: polozky.filter((p) => p.druh === "skryte").map((p) => p.id.replace(/^skryte-/, "")),
  };
}

function pridejOdpocet(nazev, od, doKdy) {
  odpoctyZapisy().uloz({ druh: "vlastni", nazev, od, ...(doKdy ? { do: doKdy } : {}) });
}

function skryjOdpocet(id) {
  odpoctyZapisy().uloz({ id: "skryte-" + id, druh: "skryte" });
}

function obnovSkryteOdpocty() {
  for (const id of nactiUlozeneOdpocty().skryte) odpoctyZapisy().smaz("skryte-" + id);
}

// Dřív se odpočty ukládaly jen v prohlížeči – převedeme je jednou na GitHub
async function prevedStareOdpocty() {
  let stare = null;
  try {
    stare = JSON.parse(localStorage.getItem(ODPOCTY_KLIC));
  } catch {
    return;
  }
  if (!stare) return;
  await odpoctyZapisy().hotovo;
  for (const u of stare.vlastni || []) {
    odpoctyZapisy().uloz({ id: u.id, druh: "vlastni", nazev: u.nazev, od: u.od, ...(u.do ? { do: u.do } : {}) });
  }
  for (const id of stare.skryte || []) skryjOdpocet(id);
  localStorage.removeItem(ODPOCTY_KLIC);
}

// --- Výpočet ---

// Z textových dat udělá Date a dopočítá, kolik dní zbývá a jestli událost právě běží
function pripravOdpocet(udalost) {
  const od = udalost.od instanceof Date ? udalost.od : parsujDatum(udalost.od);
  const konec = udalost.do ? (udalost.do instanceof Date ? udalost.do : parsujDatum(udalost.do)) : od;
  const dny = dnyDo(od);
  const dnyDoKonce = dnyDo(konec);
  return { ...udalost, od, konec, dny, dnyDoKonce, probiha: dny <= 0 && dnyDoKonce >= 0 };
}

// Pevné termíny (bez skrytých) a vlastní odpočty, jen ty, které ještě neskončily
function zakladniOdpocty() {
  const ulozene = nactiUlozeneOdpocty();
  const pevne = ODPOCTY_SKOLNI_ROK.filter((u) => !ulozene.skryte.includes(u.id));
  const vlastni = ulozene.vlastni.map((u) => ({ ...u, typ: "Osobní", vlastni: true }));
  return [...pevne, ...vlastni].map(pripravOdpocet).filter((u) => u.dnyDoKonce >= 0);
}

// Testy ze školních dat převedené na odpočty (potřebují heslo k datům)
async function testyJakoOdpocty() {
  const [testy, predmety] = await Promise.all([nactiSkolniData("testy"), nactiPredmety()]);
  return nadchazejiciTesty(testy).map((test) =>
    pripravOdpocet({
      id: "test-" + test.datum.toISOString(),
      nazev: (predmety[test.predmet]?.nazev || test.predmet) + (test.typ ? ` – ${test.typ.toLowerCase()}` : ""),
      od: test.datum,
      typ: "Test",
      poznamka: test.tema,
    })
  );
}

function seradOdpocty(odpocty) {
  // Probíhající nahoru, ostatní podle toho, kdy začínají
  return odpocty.sort((a, b) => (b.probiha - a.probiha) || (a.od - b.od));
}

// „za 6 dní“, nebo u probíhající události „teď, končí za 3 dny“
function textOdpoctu(u) {
  if (u.probiha && u.konec > u.od) return `teď · končí ${textZaKolik(u.dnyDoKonce)}`;
  return textZaKolik(u.dny);
}

// „čt 29. 10.“ nebo rozsah „23. 12. – 3. 1.“
function textDataOdpoctu(u) {
  const den = (d, sDnem) =>
    d.toLocaleDateString("cs-CZ", { weekday: sDnem ? "short" : undefined, day: "numeric", month: "numeric" });
  return u.konec > u.od ? `${den(u.od)} – ${den(u.konec)}` : den(u.od, true);
}

// Jeden řádek seznamu odpočtů (Přehled i Plán)
function vytvorRadekOdpoctu(u) {
  const polozka = vytvor("li", "polozka");
  const hlavni = vytvor("div", "polozka-hlavni");
  hlavni.append(vytvor("div", "polozka-nazev", u.nazev));
  const detail = [textDataOdpoctu(u), u.typ];
  if (u.poznamka) detail.push(u.poznamka);
  hlavni.append(vytvor("div", "polozka-detail", detail.join(" · ")));
  polozka.append(hlavni);

  const stitek = vytvor("span", "stitek", textOdpoctu(u));
  if (u.probiha || u.dny <= BRZY_DNI) stitek.classList.add("brzy");
  polozka.append(stitek);
  return polozka;
}

// Velký odpočet nejbližší události: „Za 6 dní“ a pod tím název
function vytvorHlavniOdpocet(u) {
  const blok = vytvor("div", "");
  const text = textOdpoctu(u);
  const velky = vytvor("div", "odpocet", text[0].toUpperCase() + text.slice(1));
  if (u.probiha || u.dny <= BRZY_DNI) velky.classList.add("brzy");
  blok.append(velky);
  blok.append(vytvor("p", "odpocet-nazev", `${u.nazev} · ${textDataOdpoctu(u)}`));
  return blok;
}

// Dlaždice „Odpočty“ na Přehledu: nejbližší velký a další dva pod ním.
// Testy tu nejsou – na ně má Přehled vlastní dlaždici „Nejbližší test“.
function vykresliOdpoctyDnes(obsah) {
  const misto = vytvor("div", "");
  obsah.append(misto);
  function prekresli() {
    const [prvni, ...dalsi] = seradOdpocty(zakladniOdpocty());
    if (!prvni) {
      misto.replaceChildren(vytvor("p", "slaby", "Žádné nadcházející odpočty"));
      return;
    }
    misto.replaceChildren(vytvorHlavniOdpocet(prvni));
    if (dalsi.length) {
      const seznam = vytvor("ul", "seznam");
      seznam.style.marginTop = "10px";
      seznam.append(...dalsi.slice(0, 2).map(vytvorRadekOdpoctu));
      misto.append(seznam);
    }
  }
  odpoctyZapisy().naZmenu(prekresli);
  prekresli();
}

prevedStareOdpocty();

MODULY.push({
  id: "odpocty",
  zalozka: "plan",
  obnova: { kazdychMinut: 10, zapisy: ["odpocty"] }, // změny z jiného zařízení
  // bez maxStariHodin: nic se nestahuje
  dnes: [{ nazev: "Odpočty", odkaz: "plan.html#odpocty", poradi: 2.5, vykresli: vykresliOdpoctyDnes }],
});
