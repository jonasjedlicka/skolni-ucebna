// Část Počasí v záložce Svět: aktuální stav, příštích 12 hodin a 5 dní.
// Funkce pro načtení a popis počasí jsou v js/moduly/pocasi.js.

const HODIN_V_PREDPOVEDI = 12;

async function zobrazPocasi() {
  const obsah = document.getElementById("pocasi");
  try {
    const pocasi = await nactiPocasi();
    obsah.replaceChildren();

    const karta = vytvor("div", "karta sekce");
    karta.append(vytvorAktualniPocasi(pocasi), vytvorUpozorneni(pocasi));
    obsah.append(karta);

    obsah.append(vytvor("h2", "", "Příštích 12 hodin"));
    obsah.append(vytvorHodiny(pocasi));

    obsah.append(vytvor("h2", "", "Dalších 5 dní"));
    obsah.append(vytvorDny(pocasi));
  } catch (chyba) {
    ukazChybu(obsah, chyba);
  }
}

// Vodorovný pás hodin (na mobilu se dá posouvat prstem do strany)
function vytvorHodiny(pocasi) {
  const ted = new Date();
  ted.setMinutes(0, 0, 0);
  const hodiny = hodinovaPredpoved(pocasi).filter((h) => h.cas >= ted).slice(0, HODIN_V_PREDPOVEDI);

  const pas = vytvor("div", "pocasi-hodiny sekce");
  for (const h of hodiny) {
    const bunka = vytvor("div", "pocasi-hodina");
    bunka.append(vytvor("div", "polozka-detail", h.cas.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })));
    bunka.append(vytvorIkonu(popisPocasi(h.kod).ikona));
    bunka.append(vytvor("div", "polozka-nazev", zaokrouhli(h.teplota)));
    // Pravděpodobnost srážek; od 50 % tučně, ať je déšť vidět i bez barev
    const dest = vytvor("div", "polozka-detail", h.pravdepodobnost + " %");
    if (h.pravdepodobnost >= DEST_PRAVDEPODOBNOST) dest.classList.add("pocasi-mokro");
    bunka.append(dest);
    pas.append(bunka);
  }
  return pas;
}

function vytvorDny(pocasi) {
  const d = pocasi.daily;
  const seznam = vytvor("ul", "seznam");
  d.time.forEach((den, i) => {
    const datum = parsujDatum(den);
    const popis = popisPocasi(d.weather_code[i]);
    const polozka = vytvor("li", "polozka");
    polozka.append(vytvorIkonu(popis.ikona));

    const hlavni = vytvor("div", "polozka-hlavni");
    const nazev = i === 0 ? "Dnes" : i === 1 ? "Zítra"
      : datum.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" });
    hlavni.append(vytvor("div", "polozka-nazev", nazev[0].toUpperCase() + nazev.slice(1)));
    hlavni.append(vytvor("div", "polozka-detail",
      `${popis.text} · srážky ${d.precipitation_probability_max[i]} % (${d.precipitation_sum[i]} mm)`));
    polozka.append(hlavni);

    polozka.append(vytvor("span", "pocasi-rozsah",
      `${Math.round(d.temperature_2m_min[i])}° / ${Math.round(d.temperature_2m_max[i])}°`));
    seznam.append(polozka);
  });
  return seznam;
}

zobrazPocasi();
