// Modul POČASÍ: aktuální stav, předpověď a upozornění na déšť.
// Data se stahují živě při otevření stránky z Open-Meteo (zdarma, bez klíče,
// povolené volání přímo z prohlížeče) – žádný skript v cloudu není potřeba.

// Místo: Praha. Pro jinou čtvrť stačí změnit souřadnice (najdeš je na mapy.cz).
const POCASI_MISTO = { nazev: "Praha", sirka: 50.08, delka: 14.42 };

// Kdy upozornit na déšť: aspoň tahle pravděpodobnost (%) nebo tolik srážek (mm za hodinu)
const DEST_PRAVDEPODOBNOST = 50;
const DEST_MM = 0.3;
const DEST_HODIN_DOPREDU = 12;

const POCASI_URL =
  "https://api.open-meteo.com/v1/forecast" +
  `?latitude=${POCASI_MISTO.sirka}&longitude=${POCASI_MISTO.delka}` +
  "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation" +
  "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code" +
  "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum" +
  "&timezone=Europe%2FPrague&forecast_days=5";

function nactiPocasi() {
  return nactiJson(POCASI_URL);
}

// Kód počasí (mezinárodní tabulka WMO) → český popis a ikona z IKONY
function popisPocasi(kod) {
  if (kod === 0) return { text: "Jasno", ikona: "jasno" };
  if (kod === 1) return { text: "Skoro jasno", ikona: "polojasno" };
  if (kod === 2) return { text: "Polojasno", ikona: "polojasno" };
  if (kod === 3) return { text: "Zataženo", ikona: "oblacno" };
  if (kod === 45 || kod === 48) return { text: "Mlha", ikona: "mlha" };
  if (kod >= 51 && kod <= 57) return { text: "Mrholení", ikona: "dest" };
  if (kod === 61 || kod === 80) return { text: "Slabý déšť", ikona: "dest" };
  if (kod === 63 || kod === 81) return { text: "Déšť", ikona: "dest" };
  if (kod === 65 || kod === 82) return { text: "Silný déšť", ikona: "dest" };
  if (kod === 66 || kod === 67) return { text: "Mrznoucí déšť", ikona: "dest" };
  if ((kod >= 71 && kod <= 77) || kod === 85 || kod === 86) return { text: "Sněžení", ikona: "snih" };
  if (kod >= 95) return { text: "Bouřka", ikona: "bourka" };
  return { text: "Neznámé počasí", ikona: "oblacno" };
}

// Open-Meteo vrací čas jako "2026-10-23T14:00" bez časového pásma – už v pražském čase.
// new Date("2026-10-23T14:00") takový text bere jako místní čas, což tu sedí.
function hodinovaPredpoved(pocasi) {
  const h = pocasi.hourly;
  return h.time.map((cas, i) => ({
    cas: new Date(cas),
    teplota: h.temperature_2m[i],
    pravdepodobnost: h.precipitation_probability[i],
    srazky: h.precipitation[i],
    kod: h.weather_code[i],
  }));
}

// Upozornění na déšť v příštích hodinách. Vrátí text, nebo null, když pršet nemá.
function upozorneniNaDest(pocasi) {
  const ted = new Date();
  const zacatekHodiny = new Date(ted);
  zacatekHodiny.setMinutes(0, 0, 0);
  if (pocasi.current.precipitation > 0) return "Teď prší.";

  const hranice = ted.getTime() + DEST_HODIN_DOPREDU * 3600000;
  const dest = hodinovaPredpoved(pocasi).find(
    (h) =>
      h.cas >= zacatekHodiny &&
      h.cas.getTime() <= hranice &&
      (h.pravdepodobnost >= DEST_PRAVDEPODOBNOST || h.srazky >= DEST_MM)
  );
  if (!dest) return null;
  const kdy = dest.cas.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  const den = dest.cas.getDate() === ted.getDate() ? "" : "zítra ";
  // Podle toho, co upozornění spustilo: pravděpodobnost, nebo množství srážek
  const proc = dest.pravdepodobnost >= DEST_PRAVDEPODOBNOST
    ? `${dest.pravdepodobnost} %`
    : `${dest.srazky.toLocaleString("cs-CZ")} mm`;
  return `Kolem ${den}${kdy} pravděpodobně zaprší (${proc}). Vezmi si deštník.`;
}

function zaokrouhli(teplota) {
  return Math.round(teplota) + " °C";
}

// Velký aktuální stav: ikona, teplota, popis, pocitová teplota a vítr
function vytvorAktualniPocasi(pocasi) {
  const c = pocasi.current;
  const popis = popisPocasi(c.weather_code);
  const blok = vytvor("div", "pocasi-ted");
  const ikona = vytvorIkonu(popis.ikona);
  ikona.classList.add("pocasi-ikona-velka");
  const text = vytvor("div", "");
  text.append(vytvor("div", "pocasi-teplota", zaokrouhli(c.temperature_2m)));
  text.append(vytvor("div", "polozka-detail",
    `${popis.text} · pocitově ${zaokrouhli(c.apparent_temperature)} · vítr ${Math.round(c.wind_speed_10m)} km/h`));
  blok.append(ikona, text);
  return blok;
}

// Upozornění na déšť jako výrazný (obrácený) štítek – barvy nepoužíváme
function vytvorUpozorneni(pocasi) {
  const text = upozorneniNaDest(pocasi);
  return text ? vytvor("p", "pocasi-varovani", text) : vytvor("p", "polozka-detail", "Pršet by nemělo.");
}

// Dlaždice „Počasí“ na Přehledu
async function vykresliPocasiDnes(obsah) {
  const pocasi = await nactiPocasi();
  const dnes = pocasi.daily;
  obsah.append(vytvorAktualniPocasi(pocasi));
  obsah.append(vytvor("p", "polozka-detail",
    `Dnes ${zaokrouhli(dnes.temperature_2m_min[0])} až ${zaokrouhli(dnes.temperature_2m_max[0])}`));
  obsah.append(vytvorUpozorneni(pocasi));
}

MODULY.push({
  id: "pocasi",
  zalozka: "svet",
  // bez maxStariHodin: počasí se stahuje živě, nemá data/pocasi/stav.json
  obnova: { kazdychMinut: 30, zdroje: ["https://api.open-meteo.com/"] }, // předpověď se mění pomalu
  dnes: [{ nazev: "Počasí · " + POCASI_MISTO.nazev, odkaz: "svet.html#pocasi", poradi: 0, vykresli: vykresliPocasiDnes }],
});
