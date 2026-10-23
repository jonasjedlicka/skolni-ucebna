// Část Doučování v záložce Škola: nadcházející lekce po dnech, proběhlé lekce
// s poznámkami, přidání lekce (i opakované každý týden) a úprava poznámek.
// Data a výpočty jsou v js/moduly/doucovani.js, ukládání v js/zapisy.js.

const PROBEHLYCH_NAJEDNOU = 20;
let otevrenaLekce = null; // id lekce, u které jsou rozbalené poznámky

async function zobrazDoucovani() {
  const misto = document.getElementById("doucovani");
  if (!misto) return;
  const predmety = await predmetyProDoucovani();

  const nadchazejici = vytvor("div", "lekce-dny");
  nadchazejici.id = "lekce-nadchazejici";
  const souhrn = vytvor("p", "polozka-detail");
  souhrn.id = "lekce-souhrn";
  const probehle = vytvor("details", "ukoly-hotove");
  probehle.id = "lekce-probehle";
  misto.replaceChildren(
    vytvorStavZapisu(doucovaniZapisy()),
    nadchazejici,
    probehle,
    souhrn,
    vytvorFormularLekce(predmety)
  );
  doucovaniZapisy().naZmenu(vykresliDoucovani);
  vykresliDoucovani();
  setInterval(vykresliDoucovani, 10 * 60 * 1000); // lekce se přesouvají do proběhlých
}

// Názvy předmětů pro nabídku (doučovat se dá i něco mimo rozvrh – pole je volné)
async function predmetyProDoucovani() {
  try {
    return Object.values(await nactiPredmety()).map((p) => p.nazev);
  } catch {
    return [];
  }
}

function vykresliDoucovani() {
  const misto = document.getElementById("doucovani");
  if (misto.querySelector(".upravuje")) return; // nerušit rozepsané poznámky

  const { nadchazejici, probehle } = serazeneLekce();

  // Nadcházející seskupené po dnech
  const dny = new Map();
  for (const l of nadchazejici) {
    if (!dny.has(l.datum)) dny.set(l.datum, []);
    dny.get(l.datum).push(l);
  }
  const blok = document.getElementById("lekce-nadchazejici");
  blok.replaceChildren(
    ...(dny.size
      ? [...dny].map(([datum, lekce]) => {
          const sekce = vytvor("section", "sekce");
          sekce.append(vytvor("h2", "", nazevDne(datum)));
          const ul = vytvor("ul", "seznam");
          ul.append(...lekce.map(vytvorKartuLekce));
          sekce.append(ul);
          return sekce;
        })
      : [vytvor("p", "slaby", "Žádné naplánované lekce. Přidej první níž.")])
  );

  // Proběhlé: sbalené, nejnovější nahoře
  const sbaleno = document.getElementById("lekce-probehle");
  const otevreno = sbaleno.open;
  const ul = vytvor("ul", "seznam");
  ul.append(...probehle.slice(0, PROBEHLYCH_NAJEDNOU).map(vytvorKartuLekce));
  sbaleno.replaceChildren(vytvor("summary", "", `Proběhlé lekce (${probehle.length})`), ul);
  sbaleno.hidden = probehle.length === 0;
  sbaleno.open = otevreno || probehle.some((l) => l.id === otevrenaLekce);

  // Nezaplacené proběhlé lekce (jen u lekcí s cenou)
  const nezaplacene = probehle.filter((l) => l.cena && !l.zaplaceno && !l.zruseno);
  const castka = nezaplacene.reduce((soucet, l) => soucet + Number(l.cena), 0);
  document.getElementById("lekce-souhrn").textContent = nezaplacene.length
    ? `Nezaplaceno: ${nezaplacene.length} ${nezaplacene.length === 1 ? "lekce" : nezaplacene.length <= 4 ? "lekce" : "lekcí"} (${cenaText(castka)})`
    : "";
}

// „Dnes“, „Zítra“, „úterý 3. 11.“
function nazevDne(datum) {
  const dny = dnyDo(parsujDatum(datum));
  if (dny === 0) return "Dnes";
  if (dny === 1) return "Zítra";
  const text = parsujDatum(datum).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" });
  return text[0].toUpperCase() + text.slice(1);
}

// Karta lekce: kdo, kdy, kde, štítky (zaplaceno/zrušeno), poznámky a tlačítko na jejich úpravu
function vytvorKartuLekce(l) {
  const karta = vytvor("li", "lekce-karta");
  if (l.zruseno) karta.classList.add("zrusena");
  const probehla = l.konec <= new Date();

  const hlavicka = vytvor("div", "cil-hlavicka");
  hlavicka.append(vytvor("div", "polozka-nazev", l.s));
  if (l.zruseno) hlavicka.append(vytvor("span", "stitek", "zrušeno"));
  else if (l.cena) {
    const platba = vytvor("span", "stitek", l.zaplaceno ? "zaplaceno" : cenaText(l.cena));
    if (probehla && !l.zaplaceno) platba.classList.add("brzy"); // proběhla a nezaplacená
    hlavicka.append(platba);
  }
  karta.append(hlavicka);

  const kdy = probehla
    ? l.zacatek.toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" }) + " · " + textLekce(l)
    : textLekce(l);
  karta.append(vytvor("div", "polozka-detail", kdy));

  // U nejbližší lekce připomeneme „na příště“ z minulé lekce se stejným člověkem
  const pripominka = probehla ? null : pripominkaProLekci(l);
  if (pripominka) karta.append(vytvor("div", "lekce-pripominka", "Na příště (z minula): " + pripominka));
  if (l.probrali) karta.append(vytvorPoznamkuLekce("Probrali jsme", l.probrali));
  if (l.naPriste) karta.append(vytvorPoznamkuLekce("Na příště", l.naPriste));

  const upravit = vytvor("button", "odkaz-tlacitko lekce-upravit", probehla && !l.probrali && !l.zruseno ? "Doplnit poznámky" : "Upravit");
  upravit.type = "button";
  upravit.addEventListener("click", () => {
    otevrenaLekce = l.id;
    karta.replaceWith(vytvorUpravuLekce(l));
  });
  karta.append(upravit);
  return karta;
}

function vytvorPoznamkuLekce(nadpis, text) {
  const blok = vytvor("div", "lekce-poznamka");
  blok.append(vytvor("div", "polozka-detail", nadpis), vytvor("div", "poznamka-text", text));
  return blok;
}

// Úprava lekce: poznámky, zaplaceno/zrušeno, čas a smazání
function vytvorUpravuLekce(l) {
  const karta = vytvor("li", "lekce-karta upravuje");
  const formular = vytvor("form", "cil-formular lekce-formular");
  formular.append(vytvor("div", "polozka-nazev", `${l.s} · ${nazevDne(l.datum).toLowerCase()} ${casText(l.zacatek)}`));

  const probrali = vytvorTextovePole("Co jsme probrali", l.probrali);
  const naPriste = vytvorTextovePole("Na příště (úkol, co zopakovat…)", l.naPriste);

  const datum = vytvorPopsanePole("Datum", "date", l.datum);
  const cas = vytvorPopsanePole("Čas", "time", l.cas);
  const casy = vytvor("div", "ukol-pole");
  casy.append(datum.obal, cas.obal);

  const zaplaceno = vytvorZaskrtnuti("Zaplaceno", l.zaplaceno);
  const zruseno = vytvorZaskrtnuti("Lekce se nekonala (zrušeno)", l.zruseno);

  const tlacitka = vytvor("div", "pripojeni-tlacitka");
  const ulozit = vytvor("button", "hlavni-tlacitko", "Uložit");
  ulozit.type = "submit";
  const zrusit = vytvor("button", "odkaz-tlacitko", "Zrušit");
  zrusit.type = "button";
  const smazat = vytvor("button", "odkaz-tlacitko lekce-smazat", "Smazat lekci");
  smazat.type = "button";
  tlacitka.append(ulozit, zrusit, smazat);

  formular.append(probrali.obal, naPriste.obal, casy);
  if (l.cena) formular.append(zaplaceno.obal);
  formular.append(zruseno.obal, tlacitka);

  const konec = () => {
    otevrenaLekce = null;
    karta.classList.remove("upravuje");
  };
  zrusit.addEventListener("click", () => {
    konec();
    vykresliDoucovani();
  });
  smazat.addEventListener("click", () => {
    if (!confirm(`Smazat lekci s ${l.s}?`)) return;
    konec();
    doucovaniZapisy().smaz(l.id);
  });
  formular.addEventListener("submit", (udalost) => {
    udalost.preventDefault();
    konec();
    // zacatek/konec jsou dopočítané, neukládáme je
    const { zacatek: _zacatek, konec: _konec, ...lekce } = l;
    doucovaniZapisy().uloz({
      ...lekce,
      probrali: probrali.pole.value.trim(),
      naPriste: naPriste.pole.value.trim(),
      datum: datum.pole.value || l.datum,
      cas: cas.pole.value || l.cas,
      zaplaceno: zaplaceno.pole.checked,
      zruseno: zruseno.pole.checked,
    });
  });

  karta.append(formular);
  setTimeout(() => probrali.pole.focus());
  return karta;
}

function vytvorTextovePole(popis, hodnota) {
  const obal = vytvor("label", "cil-termin");
  const pole = vytvor("textarea", "");
  pole.rows = 3;
  pole.value = hodnota || "";
  obal.append(popis, pole);
  return { obal, pole };
}

function vytvorPopsanePole(popis, typ, hodnota) {
  const obal = vytvor("label", "cil-termin");
  const pole = vytvor("input", "");
  pole.type = typ;
  pole.value = hodnota ?? "";
  obal.append(popis, pole);
  return { obal, pole };
}

function vytvorZaskrtnuti(popis, zaskrtnuto) {
  const obal = vytvor("label", "zamek-zapamatovat");
  const pole = vytvor("input", "");
  pole.type = "checkbox";
  pole.checked = Boolean(zaskrtnuto);
  obal.append(pole, " " + popis);
  return { obal, pole };
}

// Formulář nové lekce. „Každý týden“ vytvoří rovnou několik lekcí dopředu –
// každá má pak vlastní poznámky a jde přesunout nebo zrušit zvlášť.
function vytvorFormularLekce(predmety) {
  const formular = vytvor("form", "karta sekce cil-formular lekce-formular");
  formular.append(vytvor("h2", "", "Nová lekce"));

  // Nabídka dříve použitých jmen a předmětů (datalist = našeptávač u políčka)
  const jmena = vytvor("datalist", "");
  jmena.id = "doucovani-jmena";
  const seznamPredmetu = vytvor("datalist", "");
  seznamPredmetu.id = "doucovani-predmety";

  const s = vytvorPopsanePole("S kým", "text", "");
  s.pole.required = true;
  s.pole.maxLength = 60;
  s.pole.setAttribute("list", jmena.id);
  const predmet = vytvorPopsanePole("Předmět (nepovinné)", "text", "");
  predmet.pole.maxLength = 60;
  predmet.pole.setAttribute("list", seznamPredmetu.id);

  const zitra = new Date();
  zitra.setDate(zitra.getDate() + 1);
  const datum = vytvorPopsanePole("Datum", "date", datumKlic(zitra));
  datum.pole.required = true;
  const cas = vytvorPopsanePole("Čas", "time", "16:00");
  cas.pole.required = true;

  const delka = vytvor("label", "cil-termin");
  const vyberDelky = vytvor("select", "");
  for (const minut of DELKY_LEKCI) vyberDelky.append(new Option(`${minut} min`, minut));
  vyberDelky.value = 60;
  delka.append("Délka", vyberDelky);

  const misto = vytvorPopsanePole("Kde (nepovinné)", "text", "");
  misto.pole.maxLength = 60;
  const cena = vytvorPopsanePole("Cena v Kč (nepovinné)", "number", "");
  cena.pole.min = 0;
  cena.pole.inputMode = "numeric";

  const opakovat = vytvorZaskrtnuti("Opakovat každý týden", false);
  const pocet = vytvorPopsanePole("Kolikrát", "number", 10);
  pocet.pole.min = 2;
  pocet.pole.max = 40;
  pocet.obal.hidden = true;
  opakovat.pole.addEventListener("change", () => (pocet.obal.hidden = !opakovat.pole.checked));

  const radek1 = vytvor("div", "ukol-pole");
  radek1.append(s.obal, predmet.obal);
  const radek2 = vytvor("div", "ukol-pole");
  radek2.append(datum.obal, cas.obal, delka);
  const radek3 = vytvor("div", "ukol-pole");
  radek3.append(misto.obal, cena.obal);
  const pridat = vytvor("button", "hlavni-tlacitko", "Přidat lekci");
  pridat.type = "submit";
  formular.append(jmena, seznamPredmetu, radek1, radek2, radek3, opakovat.obal, pocet.obal, pridat);

  function obnovNabidky() {
    const pouzita = doucovaniZapisy().polozky();
    const unikatni = (hodnoty) => [...new Set(hodnoty.filter(Boolean))].sort((a, b) => a.localeCompare(b, "cs"));
    jmena.replaceChildren(...unikatni(pouzita.map((l) => l.s)).map((j) => new Option(j)));
    seznamPredmetu.replaceChildren(...unikatni([...predmety, ...pouzita.map((l) => l.predmet)]).map((p) => new Option(p)));
  }
  doucovaniZapisy().naZmenu(obnovNabidky);
  obnovNabidky();

  formular.addEventListener("submit", (udalost) => {
    udalost.preventDefault();
    const zaklad = {
      s: s.pole.value.trim(),
      predmet: predmet.pole.value.trim() || null,
      cas: cas.pole.value,
      delka: Number(vyberDelky.value),
      misto: misto.pole.value.trim() || null,
      cena: Number(cena.pole.value) > 0 ? Number(cena.pole.value) : null,
      zaplaceno: false,
      zruseno: false,
      vytvoreno: Date.now(),
    };
    if (!zaklad.s || !datum.pole.value) return;
    const opakovani = opakovat.pole.checked ? Math.min(40, Math.max(2, Number(pocet.pole.value) || 10)) : 1;
    const den = parsujDatum(datum.pole.value);
    for (let i = 0; i < opakovani; i++) {
      doucovaniZapisy().uloz({ ...zaklad, datum: datumKlic(den) });
      den.setDate(den.getDate() + 7);
    }
    // Jméno, čas a délka zůstanou – další lekce bývá se stejným člověkem
    datum.pole.value = "";
    opakovat.pole.checked = false;
    pocet.obal.hidden = true;
  });
  return formular;
}

zobrazDoucovani();
