// Modul MHD: odjezdy z tvých zastávek, živě z Golemio API (Pražská otevřená data).
// Zastávky a osobní klíč k API jsou zašifrované v data/mhd/nastaveni.enc.json
// (vytváří je stahovani/mhd.py). Odjezdy stahuje prohlížeč přímo, každou chvíli
// znovu – na GitHubu se nic neukládá.

const MHD_NASTAVENI = "data/mhd/nastaveni.enc.json";
const MHD_API = "https://api.golemio.cz/v2/pid/departureboards";
const MHD_MINUT_DOPREDU = 90;
const MHD_OBNOVIT_ZA_S = 30; // jak často stáhnout nové odjezdy (Golemio má limit dotazů)

const TYPY_SPOJU = { 0: "tramvaj", 1: "metro", 2: "vlak", 3: "autobus", 4: "přívoz", 7: "lanovka", 11: "trolejbus" };

// Nastavení: { klic, zastavky: [{ nazev, popis, linky, nastupiste, chuze }] }
// Když ještě neexistuje (skript neproběhl), vrátí null.
async function nactiNastaveniMhd() {
  try {
    return await nactiTajnyJson(MHD_NASTAVENI);
  } catch (chyba) {
    if (String(chyba.message).includes("chyba 404")) return null;
    throw chyba;
  }
}

// Stáhne odjezdy z jedné zastávky a nechá jen ty, které chceš vidět
async function nactiOdjezdy(zastavka, klic) {
  const parametry = new URLSearchParams({
    names: zastavka.nazev,
    minutesAfter: MHD_MINUT_DOPREDU,
    limit: 60,
    preferredTimezone: "Europe_Prague",
  });
  // Klíč posíláme v hlavičce, ne v adrese – adresy se ukládají do historie
  const odpoved = await fetch(`${MHD_API}?${parametry}`, { headers: { "x-access-token": klic } });
  if (odpoved.status === 401 || odpoved.status === 403) throw new Error("Golemio odmítlo klíč – spusť znovu stahovani/mhd.py.");
  if (odpoved.status === 429) throw new Error("Moc dotazů na Golemio, zkusím to za chvíli.");
  if (!odpoved.ok) throw new Error(`Golemio neodpovídá (chyba ${odpoved.status}).`);
  const data = await odpoved.json();

  const linky = zastavka.linky || [];
  const nastupiste = zastavka.nastupiste || [];
  return data.departures
    .map((o) => ({
      linka: o.route.short_name,
      typ: TYPY_SPOJU[o.route.type] || "spoj",
      nocni: o.route.is_night,
      cil: o.trip.headsign,
      nastupiste: o.stop.platform_code,
      odjezd: new Date(o.departure_timestamp.predicted || o.departure_timestamp.scheduled),
      zpozdeni: o.delay.is_available ? o.delay.minutes : null,
      zruseno: o.trip.is_canceled,
      bezbarierove: o.trip.is_wheelchair_accessible,
    }))
    .filter((o) => linky.length === 0 || linky.includes(o.linka))
    .filter((o) => nastupiste.length === 0 || nastupiste.includes(o.nastupiste));
}

// Za kolik minut spoj odjíždí (přepočítává se každou chvíli, i mezi staženími)
function minutDoOdjezdu(odjezd) {
  return Math.floor((odjezd - Date.now()) / 60000);
}

// Spoje, které ještě stihneš: odjíždí později, než ti trvá cesta na zastávku
function stihnutelne(odjezdy, zastavka) {
  const chuze = zastavka.chuze || 0;
  return odjezdy.filter((o) => minutDoOdjezdu(o.odjezd) >= chuze);
}

// Jeden řádek odjezdu: [linka] cíl … za 4 min
function vytvorOdjezd(o, zastavka) {
  const polozka = vytvor("li", "polozka odjezd");
  if (o.zruseno) polozka.classList.add("zruseno");

  const linka = vytvor("span", "linka", o.linka);
  if (o.typ === "metro") linka.classList.add("metro"); // metro jako obrácený štítek
  linka.title = o.typ;
  polozka.append(linka);

  const hlavni = vytvor("div", "polozka-hlavni");
  hlavni.append(vytvor("div", "polozka-nazev", o.cil));
  const detail = [o.typ];
  if (o.nastupiste) detail.push(`nást. ${o.nastupiste}`);
  if (o.zruseno) detail.push("spoj je zrušený");
  else if (o.zpozdeni > 0) detail.push(`zpoždění ${o.zpozdeni} min`);
  hlavni.append(vytvor("div", "polozka-detail", detail.join(" · ")));
  polozka.append(hlavni);

  const minut = minutDoOdjezdu(o.odjezd);
  const cas = vytvor("div", "odjezd-cas");
  cas.append(vytvor("div", "odjezd-minuty", minut <= 0 ? "teď" : `${minut} min`));
  // Když trvá cesta na zastávku, ukážeme, kdy vyrazit
  const vyrazit = minut - (zastavka.chuze || 0);
  cas.append(vytvor("div", "polozka-detail",
    zastavka.chuze ? (vyrazit <= 0 ? "vyraž hned" : `vyraž za ${vyrazit}`) : o.odjezd.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })));
  if (zastavka.chuze && vyrazit <= 1) cas.classList.add("brzy");
  polozka.append(cas);
  return polozka;
}

// Pravidelné obnovování: každých MHD_OBNOVIT_ZA_S sekund stáhne nové odjezdy,
// mezitím jen přepočítá minuty. Když seznam není vidět (jiná část záložky,
// jiná karta, zamknutý telefon), nestahuje nic – šetří limit dotazů i baterii.
// prvek = seznam odjezdů; podle něj poznáme, jestli je vidět.
function obnovujOdjezdy(prvek, stahni, vykresli) {
  let posledniStazeni = 0;
  let data = null;
  // Ještě nevložený prvek (dlaždice Přehledu se skládá stranou) bereme jako viditelný
  const jeVidet = () =>
    document.visibilityState === "visible" && (!prvek.isConnected || !prvek.checkVisibility || prvek.checkVisibility());

  async function krok() {
    if (!jeVidet()) return;
    if (Date.now() - posledniStazeni >= MHD_OBNOVIT_ZA_S * 1000) {
      posledniStazeni = Date.now();
      try {
        data = await stahni();
      } catch (chyba) {
        vykresli(null, chyba);
        return;
      }
    }
    if (data) vykresli(data);
  }
  krok();
  setInterval(krok, 10000);
  document.addEventListener("visibilitychange", krok);
  // Přepnutí na část MHD: seznam se objeví → hned stáhnout
  new IntersectionObserver((zaznamy) => {
    if (zaznamy.some((z) => z.isIntersecting)) krok();
  }).observe(prvek);
}

// Dlaždice na Přehledu: nejbližší odjezdy z první zastávky
async function vykresliMhdDnes(obsah, nadpis) {
  const nastaveni = await nactiNastaveniMhd();
  if (!nastaveni) {
    obsah.append(vytvor("p", "slaby", "MHD ještě není nastavené (stahovani/mhd.py)."));
    return;
  }
  const zastavka = nastaveni.zastavky[0];
  nadpis.textContent = "MHD · " + (zastavka.popis || zastavka.nazev);
  const seznam = vytvor("ul", "seznam");
  obsah.append(seznam);

  obnovujOdjezdy(
    seznam,
    () => nactiOdjezdy(zastavka, nastaveni.klic),
    (odjezdy, chyba) => {
      if (chyba) {
        seznam.replaceChildren(vytvor("li", "slaby", chyba.message));
        return;
      }
      const dalsi = stihnutelne(odjezdy, zastavka).slice(0, 4);
      seznam.replaceChildren(...(dalsi.length ? dalsi.map((o) => vytvorOdjezd(o, zastavka)) : [vytvor("li", "slaby", "V příštích 90 minutách nic nejede.")]));
    }
  );
}

MODULY.push({
  id: "mhd",
  zalozka: "svet",
  // bez maxStariHodin: odjezdy jsou živé
  dnes: [{ nazev: "MHD", odkaz: "svet.html#mhd", poradi: 0.5, vykresli: vykresliMhdDnes }],
});
