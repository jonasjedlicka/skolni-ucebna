// Modul DOUČOVÁNÍ: rozpis lekcí a poznámky k nim, ukládané zašifrovaně
// na GitHub (js/zapisy.js). Funguje stejně, ať doučuješ ty, nebo doučují tebe.
// Lekce: { s, predmet?, datum: "2026-10-27", cas: "16:00", delka: 60, misto?,
//          cena?, zaplaceno, zruseno, probrali?, naPriste?, vytvoreno, zmeneno }

const DELKY_LEKCI = [45, 60, 90, 120];

function doucovaniZapisy() {
  return otevriZapisy("doucovani", "doučování");
}

// Začátek a konec lekce jako Date
function casyLekce(lekce) {
  const zacatek = parsujDatum(lekce.datum);
  const [h, m] = (lekce.cas || "00:00").split(":").map(Number);
  zacatek.setHours(h, m, 0, 0);
  return { zacatek, konec: new Date(zacatek.getTime() + (lekce.delka || 60) * 60000) };
}

// Nadcházející (i právě probíhající) od nejbližší, proběhlé od nejnovější
function serazeneLekce() {
  const ted = new Date();
  const vsechny = doucovaniZapisy().polozky().map((l) => ({ ...l, ...casyLekce(l) }));
  const nadchazejici = vsechny.filter((l) => l.konec > ted).sort((a, b) => a.zacatek - b.zacatek);
  const probehle = vsechny.filter((l) => l.konec <= ted).sort((a, b) => b.zacatek - a.zacatek);
  return { nadchazejici, probehle };
}

// Poslední proběhlá lekce se stejným člověkem – kvůli „na příště“
function minulaLekce(lekce) {
  return serazeneLekce().probehle.find((l) => l.s === lekce.s && l.id !== lekce.id && !l.zruseno);
}

// „Na příště“ z minula připomeneme jen u nejbližší lekce s daným člověkem
function pripominkaProLekci(lekce) {
  const nejblizsi = serazeneLekce().nadchazejici.find((l) => l.s === lekce.s && !l.zruseno);
  if (nejblizsi?.id !== lekce.id) return null;
  return minulaLekce(lekce)?.naPriste || null;
}

function casText(datum) {
  return datum.toLocaleTimeString("cs-CZ", { hour: "numeric", minute: "2-digit" });
}

// „16:00–17:00 · Anglický jazyk · u Nováků“
function textLekce(l) {
  const casti = [`${casText(l.zacatek)}–${casText(l.konec)}`];
  if (l.predmet) casti.push(l.predmet);
  if (l.misto) casti.push(l.misto);
  return casti.join(" · ");
}

function cenaText(cena) {
  return Number(cena).toLocaleString("cs-CZ") + " Kč";
}

// Řádek lekce pro Přehled: kdo, kdy a co je „na příště“ z minulé lekce
function vytvorRadekLekce(l) {
  const polozka = vytvor("li", "polozka lekce");
  if (l.zruseno) polozka.classList.add("zrusena");
  const hlavni = vytvor("div", "polozka-hlavni");
  hlavni.append(vytvor("div", "polozka-nazev", l.s));
  hlavni.append(vytvor("div", "polozka-detail", textLekce(l) + (l.zruseno ? " · zrušeno" : "")));
  const pripominka = pripominkaProLekci(l);
  if (pripominka) hlavni.append(vytvor("div", "lekce-pripominka", "Na příště: " + pripominka));
  polozka.append(hlavni);
  const dny = dnyDo(parsujDatum(l.datum));
  const stitek = vytvor("span", "stitek", l.zacatek <= new Date() ? "teď" : dny === 0 ? casText(l.zacatek) : textZaKolik(dny));
  if (dny === 0) stitek.classList.add("brzy");
  polozka.append(stitek);
  return polozka;
}

// Dlaždice „Doučování“ na Přehledu – jen když je lekce dnes nebo zítra.
// Vrátí false, když není co ukázat (Přehled pak dlaždici vynechá).
async function vykresliDoucovaniDnes(obsah) {
  await doucovaniZapisy().hotovo;
  const seznam = vytvor("ul", "seznam");
  obsah.append(seznam);
  function prekresli() {
    const brzke = serazeneLekce().nadchazejici.filter((l) => dnyDo(parsujDatum(l.datum)) <= 1);
    seznam.replaceChildren(
      ...(brzke.length ? brzke.map(vytvorRadekLekce) : [vytvor("li", "slaby", "Dnes ani zítra žádné doučování.")])
    );
  }
  doucovaniZapisy().naZmenu(prekresli);
  prekresli();
  return serazeneLekce().nadchazejici.some((l) => dnyDo(parsujDatum(l.datum)) <= 1);
}

MODULY.push({
  id: "doucovani",
  zalozka: "skola",
  dnes: [{ nazev: "Doučování", odkaz: "skola.html#doucovani", poradi: 2.2, vykresli: vykresliDoucovaniDnes }],
});
