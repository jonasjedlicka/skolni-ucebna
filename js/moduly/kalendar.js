// Modul KALENDÁŘ: události z Google Kalendáře na příštích 30 dní.
// Data jsou zašifrovaná v data/kalendar/ a plní je stahovani/kalendar.py
// přes GitHub Actions.

const KALENDAR_DATA = "data/kalendar/";

// Ke každé události dopočítá skutečné časy jako Date:
// - celodenní má jen datum ("2026-10-29"), konec je v iCal „do“ (ten den už nepatří)
// - ostatní mají čas s časovým pásmem ("2026-11-03T16:00+01:00")
function pripravUdalost(udalost) {
  if (udalost.celodenni) {
    const zacatek = parsujDatum(udalost.zacatek);
    const konec = udalost.konec ? parsujDatum(udalost.konec) : new Date(zacatek.getTime() + 864e5);
    return { ...udalost, zacatek, konec };
  }
  const zacatek = new Date(udalost.zacatek);
  return { ...udalost, zacatek, konec: udalost.konec ? new Date(udalost.konec) : zacatek };
}

// Vrátí jen události, které ještě neskončily, seřazené podle začátku
async function nactiUdalosti() {
  const udalosti = await nactiTajnyJson(KALENDAR_DATA + "udalosti.enc.json");
  const ted = new Date();
  return udalosti
    .map(pripravUdalost)
    .filter((u) => u.konec > ted)
    .sort((a, b) => a.zacatek - b.zacatek);
}

// Půlnoc daného dne – podle ní události seskupujeme
function pulnoc(datum) {
  const den = new Date(datum);
  den.setHours(0, 0, 0, 0);
  return den;
}

// Rozdělí události podle dní. Událost, která začala dřív a pořád trvá
// (třeba prázdniny), patří k dnešku.
function podleDni(udalosti) {
  const dnes = pulnoc(new Date());
  const dny = new Map(); // klíč = čas půlnoci, hodnota = seznam událostí
  for (const udalost of udalosti) {
    const den = Math.max(pulnoc(udalost.zacatek).getTime(), dnes.getTime());
    if (!dny.has(den)) dny.set(den, []);
    dny.get(den).push(udalost);
  }
  return dny;
}

// „Dnes“, „Zítra“, nebo „Úterý 3. 11.“
function nazevDne(cas) {
  const dny = dnyDo(new Date(cas));
  if (dny === 0) return "Dnes";
  if (dny === 1) return "Zítra";
  const text = new Date(cas).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" });
  return text[0].toUpperCase() + text.slice(1);
}

function hodinyMinuty(datum) {
  return datum.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

function vytvorUdalost(udalost) {
  const polozka = vytvor("li", "polozka");
  polozka.append(vytvor("span", "polozka-cas", udalost.celodenni ? "celý den" : hodinyMinuty(udalost.zacatek)));

  const hlavni = vytvor("div", "polozka-hlavni");
  hlavni.append(vytvor("div", "polozka-nazev", udalost.nazev));

  const detail = [];
  if (udalost.celodenni) {
    // Konec je „do“, takže poslední den je o den dřív
    const posledniDen = new Date(udalost.konec.getTime() - 864e5);
    if (posledniDen > udalost.zacatek) {
      detail.push("do " + posledniDen.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" }));
    }
  } else {
    detail.push(`${hodinyMinuty(udalost.zacatek)}–${hodinyMinuty(udalost.konec)}`);
  }
  if (udalost.misto) detail.push(udalost.misto);
  detail.push(udalost.kalendar);
  hlavni.append(vytvor("div", "polozka-detail", detail.join(" · ")));

  polozka.append(hlavni);
  return polozka;
}

// Vykreslí události seskupené po dnech do zadaného prvku
function vykresliDny(kontejner, udalosti) {
  if (udalosti.length === 0) {
    kontejner.append(vytvor("p", "slaby", "Žádné události"));
    return;
  }
  for (const [den, udalostiDne] of podleDni(udalosti)) {
    const sekce = vytvor("section", "sekce");
    sekce.append(vytvor("h3", "", nazevDne(den)));
    const seznam = vytvor("ul", "seznam");
    seznam.append(...udalostiDne.map(vytvorUdalost));
    sekce.append(seznam);
    kontejner.append(sekce);
  }
}

// Dlaždice „Kalendář na dnes“ v sekci Dnes: dnešní události
// včetně vícedenních, které právě probíhají
async function vykresliKalendarDnes(obsah) {
  const zitra = pulnoc(new Date()).getTime() + 864e5;
  const dnesni = (await nactiUdalosti()).filter((u) => u.zacatek.getTime() < zitra);
  if (dnesni.length === 0) {
    obsah.append(vytvor("p", "slaby", "Dnes nic naplánovaného"));
    return;
  }
  const seznam = vytvor("ul", "seznam");
  seznam.append(...dnesni.map(vytvorUdalost));
  obsah.append(seznam);
}

MODULY.push({
  id: "kalendar",
  zalozka: "kalendar",
  maxStariHodin: 6, // stahuje se každé 2 hodiny
  obnova: { kazdychMinut: 30, zdroje: [KALENDAR_DATA] },
  dnes: [{ nazev: "Kalendář na dnes", odkaz: "kalendar.html", poradi: 3, vykresli: vykresliKalendarDnes }],
});
