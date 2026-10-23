// Modul AKCIE: hodnota portfolia a ceny sledovaných akcií.
// Data jsou v ~/Dashboard-data/akcie/ na Macu: portfolio (co máš) vyplňuješ ty,
// ceny stahuje stahovani/akcie.py. Hodnotu počítáme až tady.
// Jen zobrazujeme – nic nekupujeme ani neprodáváme.

const AKCIE_DATA = "data/akcie/";

async function nactiAkcie() {
  const [portfolio, ceny] = await Promise.all([
    nactiJson(AKCIE_DATA + "portfolio.json"),
    nactiJson(AKCIE_DATA + "ceny.json"),
  ]);
  return { portfolio, ceny };
}

// Kolik korun je jedna jednotka měny (USD → 21,65). Neznámá měna → null.
function kurzNaKoruny(ceny, mena) {
  return ceny.kurzy.kurzy[mena] ?? null;
}

// Spočítá hodnotu, zisk a dnešní změnu každé držené akcie i celého portfolia.
// Nákupní cenu přepočítáváme dnešním kurzem – zisk tak ukazuje jen pohyb
// ceny akcie, ne pohyb kurzu měny. Pro přehled to stačí.
function spocitejPortfolio({ portfolio, ceny }) {
  const pozice = [];
  const celkem = { hodnota: 0, naklad: 0, zmenaDnes: 0, chybi: 0 };

  for (const drzena of portfolio.drzene) {
    const akcie = ceny.akcie[drzena.symbol];
    const kurz = akcie && kurzNaKoruny(ceny, akcie.mena);
    if (!akcie || kurz === null) {
      celkem.chybi++; // cena se nestáhla, do součtu ji nepočítáme
      pozice.push({ ...drzena, akcie: null });
      continue;
    }
    const hodnota = drzena.kusu * akcie.cena * kurz;
    const naklad = drzena.kusu * drzena.nakupni_cena * kurz;
    // Kolik bylo včera: dnešní hodnota „bez“ dnešní procentní změny
    const vcera = akcie.zmena_den === null ? hodnota : hodnota / (1 + akcie.zmena_den / 100);
    pozice.push({ ...drzena, akcie, hodnota, zisk: hodnota - naklad, ziskProcent: (hodnota / naklad - 1) * 100 });
    celkem.hodnota += hodnota;
    celkem.naklad += naklad;
    celkem.zmenaDnes += hodnota - vcera;
  }
  celkem.zisk = celkem.hodnota - celkem.naklad;
  celkem.ziskProcent = celkem.naklad ? (celkem.hodnota / celkem.naklad - 1) * 100 : 0;
  celkem.zmenaDnesProcent = celkem.hodnota ? (celkem.zmenaDnes / (celkem.hodnota - celkem.zmenaDnes)) * 100 : 0;
  return { pozice, celkem };
}

// --- Formátování čísel česky: „12 345 Kč“, „+1,5 %“ ---

function korun(castka) {
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(castka);
}

function vMene(castka, mena) {
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: mena, maximumFractionDigits: 2 }).format(castka);
}

function procenta(cislo) {
  const text = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(Math.abs(cislo));
  return `${cislo >= 0 ? "+" : "−"}${text} %`;
}

// Změna se šipkou: ▲ růst, ▼ pokles. Dashboard je bez barev,
// takže směr musí být poznat z tvaru, ne ze zelené a červené.
function vytvorZmenu(text, cislo) {
  return vytvor("span", cislo >= 0 ? "zisk" : "ztrata", (cislo >= 0 ? "▲ " : "▼ ") + text);
}

// Malý graf ceny za poslední měsíc (sparkline) jako SVG
function vytvorGraf(historie) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 30");
  svg.setAttribute("class", "graf");
  if (historie.length < 2) return svg;
  const min = Math.min(...historie);
  const rozsah = Math.max(...historie) - min || 1;
  const body = historie.map((cena, i) => {
    const x = (i / (historie.length - 1)) * 100;
    const y = 28 - ((cena - min) / rozsah) * 26; // v SVG roste y směrem dolů
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const cara = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  cara.setAttribute("points", body.join(" "));
  cara.setAttribute("class", historie.at(-1) >= historie[0] ? "graf-zisk" : "graf-ztrata");
  svg.append(cara);
  return svg;
}

// Jeden řádek akcie: název, cena, dnešní změna a graf
function vytvorAkcii(symbol, akcie, podrobnosti) {
  const polozka = vytvor("li", "polozka akcie");
  const hlavni = vytvor("div", "polozka-hlavni");
  hlavni.append(vytvor("div", "polozka-nazev", akcie ? akcie.nazev : symbol));
  if (!akcie) {
    hlavni.append(vytvor("div", "chyba", "Cena se nestáhla"));
    polozka.append(hlavni);
    return polozka;
  }
  const detail = vytvor("div", "polozka-detail", `${symbol} · ${vMene(akcie.cena, akcie.mena)} `);
  if (akcie.zmena_den !== null) detail.append(vytvorZmenu(procenta(akcie.zmena_den), akcie.zmena_den));
  hlavni.append(detail);
  if (podrobnosti) hlavni.append(vytvor("div", "polozka-detail", podrobnosti));
  polozka.append(hlavni, vytvorGraf(akcie.historie));
  return polozka;
}

// Souhrn portfolia: hodnota velkým písmem, pod ní dnešní změna a celkový zisk
function vytvorSouhrn(celkem) {
  const souhrn = vytvor("div", "akcie-souhrn");
  souhrn.append(vytvor("div", "akcie-hodnota", korun(celkem.hodnota)));
  const dnes = vytvor("div", "polozka-detail", "dnes ");
  dnes.append(vytvorZmenu(`${korun(celkem.zmenaDnes)} (${procenta(celkem.zmenaDnesProcent)})`, celkem.zmenaDnes));
  const zisk = vytvor("div", "polozka-detail", "celkem ");
  zisk.append(vytvorZmenu(`${korun(celkem.zisk)} (${procenta(celkem.ziskProcent)})`, celkem.zisk));
  souhrn.append(dnes, zisk);
  if (celkem.chybi) souhrn.append(vytvor("div", "chyba", `U ${celkem.chybi} akcií chybí cena, v součtu nejsou.`));
  return souhrn;
}

// Dlaždice „Finance“ na Přehledu: hodnota portfolia a dnešní změna
async function vykresliFinanceDnes(obsah) {
  const { celkem } = spocitejPortfolio(await nactiAkcie());
  obsah.append(vytvorSouhrn(celkem));
}

MODULY.push({
  id: "akcie",
  zalozka: "svet",
  maxStariHodin: 72, // o víkendu se nestahuje, takže v pondělí ráno jsou data z pátku
  obnova: { kazdychMinut: 15, zdroje: [AKCIE_DATA] }, // ceny se na Macu stahují každou hodinu
  dnes: [{ nazev: "Finance", odkaz: "svet.html#finance", poradi: 4, vykresli: vykresliFinanceDnes }],
});
