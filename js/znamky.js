// Část Známky v záložce Škola: celkový průměr, předměty s váženým průměrem,
// známky z Edookitu i vlastní, přidání vlastní známky a kalkulačka „co potřebuju dostat“.
// Výpočty a ukládání jsou v js/moduly/znamky.js a js/zapisy.js.

let obdobiZnamek = null; // vybrané pololetí ("2026/27-1") nebo celý rok ("rok:2026/27")
let predmetyZnamek = {}; // předměty ze školních dat (kvůli názvům)
const otevrenePredmety = new Set(); // rozbalené předměty (přežijí překreslení)

async function zobrazZnamky() {
  const misto = document.getElementById("znamky");
  if (!misto) return;
  const predmety = await predmetyProUkoly();
  predmetyZnamek = predmety;
  obdobiZnamek = aktualniPololeti();

  const filtry = vytvor("div", "filtry");
  filtry.id = "znamky-obdobi";
  const souhrn = vytvor("div", "karta sekce znamky-souhrn");
  souhrn.id = "znamky-souhrn";
  const seznam = vytvor("ul", "seznam znamky-seznam");
  seznam.id = "znamky-seznam";
  seznam.classList.add("sekce");
  misto.replaceChildren(vytvorStavZapisu(znamkyZapisy()), filtry, souhrn, seznam, vytvorFormularZnamky(predmety));

  znamkyZapisy().naZmenu(() => vykresliZnamky(predmety));
  // Známky z Edookitu: načíst hned a pak s kolečkem / každých 30 minut
  zaregistrujObnovu({
    misto: document.getElementById("obnova-znamky"),
    kontejner: seznam,
    kazdychMinut: 30,
    maxStariHodin: 24,
    obnov: async () => {
      zapomenNactene([SKOLA_DATA]);
      await nactiZnamkyEdookit();
      vykresliZnamky(predmety);
      return casZeStavu("skola");
    },
  });
}

function vykresliZnamky(predmety) {
  // Rozepsanou kalkulačku nepřekreslujeme
  const seznam = document.getElementById("znamky-seznam");
  if (seznam.contains(document.activeElement) && document.activeElement.matches("input")) return;

  vykresliObdobi();
  const vPredmetech = predmetySeZnamkami(obdobiZnamek).sort((a, b) =>
    (predmety[a.predmet]?.nazev || a.predmet).localeCompare(predmety[b.predmet]?.nazev || b.predmet, "cs")
  );

  // Souhrn: celkový průměr a nejhorší předmět
  const souhrn = document.getElementById("znamky-souhrn");
  const celkem = celkovyPrumer(vPredmetech);
  souhrn.replaceChildren(vytvor("div", "odpocet", textPrumeru(celkem)));
  if (vPredmetech.length) {
    const nejhorsi = vPredmetech.filter((p) => p.vazeny !== null).reduce((a, b) => (b.vazeny > a.vazeny ? b : a), vPredmetech[0]);
    const pocet = vPredmetech.reduce((s, p) => s + p.znamky.length, 0);
    souhrn.append(
      vytvor("p", "polozka-detail", `celkový průměr z ${vPredmetech.length} předmětů (${pocet} známek) · průměr vážených průměrů předmětů`),
      vytvor("p", "znamky-nejhorsi", `Nejhorší: ${predmety[nejhorsi.predmet]?.nazev || nejhorsi.predmet} (${textPrumeru(nejhorsi.vazeny)})`)
    );
  } else {
    souhrn.append(vytvor("p", "slaby", "V tomhle období zatím žádné známky."));
  }

  seznam.replaceChildren(...vPredmetech.map((p) => vytvorPredmetZnamek(p, predmety)));
}

// Přepínač období: pololetí, ve kterých jsou známky (+ aktuální), a celý rok
function vykresliObdobi() {
  const filtry = document.getElementById("znamky-obdobi");
  const pololeti = new Set([aktualniPololeti(), ...znamkyVObdobi(null).map((z) => pololetiZnamky(z.datum))]);
  const moznosti = [...pololeti].sort().reverse().map((k) => [k, textPololeti(k)]);
  const rok = aktualniPololeti().split("-")[0];
  moznosti.push([`rok:${rok}`, `Celý rok ${rok}`]);
  filtry.replaceChildren(
    ...moznosti.map(([klic, popis]) => {
      const tlacitko = vytvor("button", "filtr", popis);
      tlacitko.type = "button";
      tlacitko.classList.toggle("vybrany", klic === obdobiZnamek);
      tlacitko.addEventListener("click", () => {
        obdobiZnamek = klic;
        vykresliZnamky(predmetyZnamek);
      });
      return tlacitko;
    })
  );
}

// Karta předmětu: název, vážený průměr, známky; rozbalením seznam a kalkulačka
function vytvorPredmetZnamek(p, predmety) {
  const nazev = predmety[p.predmet]?.nazev || p.predmet;
  const karta = vytvor("li", "znamky-predmet");
  const souhrn = vytvor("details", "");
  souhrn.open = otevrenePredmety.has(p.predmet);
  souhrn.addEventListener("toggle", () => {
    if (souhrn.open) otevrenePredmety.add(p.predmet);
    else otevrenePredmety.delete(p.predmet);
  });

  const hlavicka = vytvor("summary", "znamky-hlavicka");
  const vlevo = vytvor("div", "polozka-hlavni");
  vlevo.append(vytvor("div", "polozka-nazev", nazev));
  const radek = vytvor("div", "znamky-radek");
  for (const z of p.znamky) {
    const znamka = vytvor("span", "znamka", textZnamky(z.hodnota));
    if (z.vaha !== 1) znamka.append(vytvor("sub", "", "×" + cisloVahy(z.vaha)));
    const puvodni = z.text && z.text !== textZnamky(z.hodnota) ? ` (${z.text})` : ""; // „75 %“
    znamka.title = `${z.popis || "známka"}${puvodni} · váha ${cisloVahy(z.vaha)} · ${parsujDatum(z.datum).toLocaleDateString("cs-CZ")}`;
    radek.append(znamka);
  }
  vlevo.append(radek);
  const vpravo = vytvor("div", "znamky-prumer");
  vpravo.append(
    vytvor("div", "znamky-prumer-cislo", textPrumeru(p.vazeny)),
    vytvor("div", "polozka-detail", `aritm. ${textPrumeru(p.aritmeticky)}`)
  );
  hlavicka.append(vlevo, vpravo);
  souhrn.append(hlavicka);

  // Rozbalená část: všechny známky a kalkulačka. Vlastní jdou smazat,
  // známky z Edookitu ne (při dalším stažení by se stejně vrátily).
  const ul = vytvor("ul", "seznam znamky-detail");
  for (const z of [...p.znamky].reverse()) {
    const li = vytvor("li", "polozka");
    li.append(vytvor("span", "znamka", textZnamky(z.hodnota)));
    const hlavni = vytvor("div", "polozka-hlavni");
    hlavni.append(vytvor("div", "", z.popis || "známka"));
    const detail = [];
    if (z.text && z.text !== textZnamky(z.hodnota)) detail.push(`${z.text} → ${textZnamky(z.hodnota)}`); // „75 % → 2“
    detail.push(`váha ${cisloVahy(z.vaha)}`, parsujDatum(z.datum).toLocaleDateString("cs-CZ"));
    detail.push(z.zEdookitu ? "z Edookitu" : "vlastní");
    hlavni.append(vytvor("div", "polozka-detail", detail.join(" · ")));
    li.append(hlavni);
    if (!z.zEdookitu) {
      const smazat = vytvor("button", "odebrat-tlacitko", "×");
      smazat.type = "button";
      smazat.setAttribute("aria-label", `Smazat známku ${textZnamky(z.hodnota)} z ${nazev}`);
      smazat.addEventListener("click", () => {
        if (confirm(`Smazat známku ${textZnamky(z.hodnota)} (${z.popis || nazev})?`)) znamkyZapisy().smaz(z.id);
      });
      li.append(smazat);
    }
    ul.append(li);
  }
  souhrn.append(ul, vytvorKalkulacku(p));
  karta.append(souhrn);
  return karta;
}

function cisloVahy(vaha) {
  return Number(vaha).toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
}

// Kalkulačka: chci průměr nejvýš X, další známka má váhu Y → co potřebuju
function vytvorKalkulacku(p) {
  const blok = vytvor("form", "znamky-kalkulacka");
  blok.append(vytvor("div", "polozka-nazev", "Co potřebuju dostat?"));
  const cil = vytvor("input", "");
  cil.type = "number";
  cil.step = "0.01";
  cil.min = 1;
  cil.max = 5;
  cil.inputMode = "decimal";
  // Výchozí cíl: nejbližší „hezčí“ hranice pod současným průměrem (např. 2,38 → 2,0);
  // u průměru do 1,5 je cílem 1,5 udržet
  cil.value = p.vazeny > 1.5 ? Math.floor((p.vazeny - 0.01) * 2) / 2 : 1.5;
  const vaha = vytvor("input", "");
  vaha.type = "number";
  vaha.step = "0.5";
  vaha.min = 0.5;
  vaha.inputMode = "decimal";
  vaha.value = 1;
  const popisCil = vytvor("label", "cil-termin");
  popisCil.append("Chci průměr nejvýš", cil);
  const popisVaha = vytvor("label", "cil-termin");
  popisVaha.append("Váha další známky", vaha);
  const pole = vytvor("div", "ukol-pole");
  pole.append(popisCil, popisVaha);
  const vysledek = vytvor("p", "znamky-vysledek");
  blok.append(pole, vysledek);

  const spocitej = () => {
    vysledek.textContent = coPotrebuju(p, Number(cil.value), Number(vaha.value)).text;
  };
  cil.addEventListener("input", spocitej);
  vaha.addEventListener("input", spocitej);
  blok.addEventListener("submit", (u) => u.preventDefault());
  spocitej();
  return blok;
}

// Formulář nové známky: předmět, známka (tlačítka), váha, popis a datum
function vytvorFormularZnamky(predmety) {
  const formular = vytvor("form", "karta sekce cil-formular znamky-formular");
  formular.append(vytvor("h2", "", "Přidat vlastní známku"));
  formular.append(vytvor("p", "polozka-detail", "Známky z Edookitu se stahují samy každých 6 hodin. Sem přidej jen tu, která v Edookitu ještě není – jakmile tam přibude, vlastní smaž, ať se nepočítá dvakrát."));

  const predmet = vytvor("select", "");
  predmet.required = true;
  predmet.setAttribute("aria-label", "Předmět");
  predmet.append(new Option("Předmět…", ""));
  for (const p of Object.values(predmety)) predmet.append(new Option(p.nazev, p.id));
  if (Object.keys(predmety).length === 0) {
    formular.append(vytvor("p", "chyba", "Předměty se nenačetly – odemkni školní data heslem."));
  }

  let hodnota = null;
  const znamky = vytvor("div", "filtry vyber-znamky");
  for (const h of HODNOTY_ZNAMEK) {
    const tlacitko = vytvor("button", "filtr", textZnamky(h));
    tlacitko.type = "button";
    tlacitko.setAttribute("aria-label", `Známka ${textZnamky(h)}`);
    tlacitko.addEventListener("click", () => {
      hodnota = h;
      for (const t of znamky.children) t.classList.toggle("vybrany", t === tlacitko);
    });
    znamky.append(tlacitko);
  }

  // Váha: rychlá volba ×1 ×2 ×3, nebo libovolné číslo do pole
  const vaha = vytvor("input", "");
  vaha.type = "number";
  vaha.step = "0.5";
  vaha.min = 0.5;
  vaha.max = 20;
  vaha.value = 1;
  vaha.inputMode = "decimal";
  vaha.setAttribute("aria-label", "Váha");
  const vahy = vytvor("div", "filtry vyber-vahy");
  for (const [v, popis] of [[1, "×1 zkoušení"], [2, "×2 test"], [3, "×3 velký test"]]) {
    const tlacitko = vytvor("button", "filtr", popis);
    tlacitko.type = "button";
    tlacitko.addEventListener("click", () => {
      vaha.value = v;
      oznacVahu();
    });
    tlacitko.dataset.vaha = v;
    vahy.append(tlacitko);
  }
  const oznacVahu = () => {
    for (const t of vahy.children) t.classList.toggle("vybrany", Number(t.dataset.vaha) === Number(vaha.value));
  };
  vaha.addEventListener("input", oznacVahu);
  oznacVahu();

  const popis = vytvor("input", "");
  popis.placeholder = "Za co (nepovinné), např. Test – derivace";
  popis.maxLength = 80;
  popis.setAttribute("aria-label", "Popis");
  const datum = vytvor("input", "");
  datum.type = "date";
  datum.value = datumKlic();
  datum.required = true;
  datum.setAttribute("aria-label", "Datum");

  const vahaRadek = vytvor("div", "znamky-vaha");
  vahaRadek.append(vahy, vaha);
  const pridat = vytvor("button", "hlavni-tlacitko", "Přidat známku");
  pridat.type = "submit";
  const chyba = vytvor("p", "chyba");
  formular.append(predmet, znamky, vahaRadek, popis, datum, chyba, pridat);

  formular.addEventListener("submit", (udalost) => {
    udalost.preventDefault();
    const v = Number(vaha.value);
    if (!predmet.value) return (chyba.textContent = "Vyber předmět.");
    if (hodnota === null) return (chyba.textContent = "Vyber známku.");
    if (!(v > 0)) return (chyba.textContent = "Váha musí být kladné číslo.");
    chyba.textContent = "";
    znamkyZapisy().uloz({ druh: "znamka", predmet: predmet.value, hodnota, vaha: v, popis: popis.value.trim() || null, datum: datum.value });
    otevrenePredmety.add(predmet.value);
    // Předmět, váha a datum zůstanou – často zapisuješ víc známek z jednoho předmětu
    hodnota = null;
    for (const t of znamky.children) t.classList.remove("vybrany");
    popis.value = "";
  });
  return formular;
}

zobrazZnamky();
