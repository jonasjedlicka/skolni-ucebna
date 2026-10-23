// Část Cíle v záložce Plán: rozpracované cíle s ukazatelem pokroku,
// ovládání (+/−, kroky), přidání, úprava, smazání a sbalené splněné cíle.
// Výpočty a ukládání jsou v js/moduly/cile.js a js/zapisy.js.

let upravovanyCil = null;

function zobrazCile() {
  const misto = document.getElementById("cile");
  const seznam = vytvor("ul", "seznam cile-seznam");
  seznam.id = "cile-seznam";
  const splnene = vytvor("details", "ukoly-hotove");
  splnene.id = "cile-splnene";
  misto.replaceChildren(vytvorStavZapisu(cileZapisy()), seznam, splnene, vytvorFormularCile());
  cileZapisy().naZmenu(vykresliCile);
  vykresliCile();
}

function vykresliCile() {
  const seznam = document.getElementById("cile-seznam");
  if (upravovanyCil && seznam.querySelector(".upravuje")) return; // nerušit rozepsanou úpravu
  // Rozepsaný nový krok také nepřepisovat
  if (seznam.contains(document.activeElement) && document.activeElement.matches("input")) return;

  const { aktivni, splnene } = serazeneCile();
  seznam.replaceChildren(
    ...(aktivni.length ? aktivni.map(vytvorKartuCile) : [vytvor("li", "slaby", "Žádné rozpracované cíle. Přidej nový níž.")])
  );

  const sbaleno = document.getElementById("cile-splnene");
  const otevreno = sbaleno.open;
  const ul = vytvor("ul", "seznam");
  ul.append(...splnene.map(vytvorKartuCile));
  sbaleno.replaceChildren(vytvor("summary", "", `Splněné (${splnene.length})`), ul);
  sbaleno.hidden = splnene.length === 0;
  sbaleno.open = otevreno;
}

// Karta cíle: název, ukazatel, ovládání podle typu a tlačítka upravit/smazat
function vytvorKartuCile(c) {
  const karta = vytvor("li", "cil-karta");
  if (jeSplneny(c)) karta.classList.add("splneny");

  const hlavicka = vytvor("div", "cil-hlavicka");
  hlavicka.append(vytvor("div", "polozka-nazev", c.nazev));
  const upravit = vytvor("button", "odebrat-tlacitko ikonove");
  upravit.type = "button";
  upravit.title = "Upravit";
  upravit.setAttribute("aria-label", `Upravit ${c.nazev}`);
  upravit.append(vytvorIkonu("upravit"));
  upravit.addEventListener("click", () => {
    upravovanyCil = c.id;
    karta.replaceWith(vytvorUpravuCile(c));
  });
  const smazat = vytvor("button", "odebrat-tlacitko ikonove", "×");
  smazat.type = "button";
  smazat.title = "Smazat";
  smazat.setAttribute("aria-label", `Smazat ${c.nazev}`);
  smazat.addEventListener("click", () => {
    if (confirm(`Smazat cíl „${c.nazev}“?`)) cileZapisy().smaz(c.id);
  });
  hlavicka.append(upravit, smazat);
  karta.append(hlavicka, vytvorUkazatel(prubehCile(c).podil));

  const detail = [textPrubehu(c)];
  const tempo = textTempa(c);
  if (tempo) detail.push(tempo);
  if (jeSplneny(c)) detail.push("splněno " + new Date(c.splnenoKdy).toLocaleDateString("cs-CZ"));
  karta.append(vytvor("div", "polozka-detail", detail.join(" · ")));

  karta.append(c.typ === "kroky" ? vytvorKroky(c) : vytvorOvladaniCisla(c));
  return karta;
}

// Číselný cíl: −1, +1 a pole pro přesnou hodnotu
function vytvorOvladaniCisla(c) {
  const radek = vytvor("div", "cil-ovladani");
  const minus = vytvor("button", "filtr", "−1");
  minus.type = "button";
  minus.setAttribute("aria-label", `Ubrat 1 z cíle ${c.nazev}`);
  minus.addEventListener("click", () => ulozCil({ ...c, aktualne: Math.max(0, (Number(c.aktualne) || 0) - 1) }));

  const pole = vytvor("input", "");
  pole.type = "number";
  pole.inputMode = "decimal";
  pole.step = "any";
  pole.min = 0;
  pole.value = c.aktualne || 0;
  pole.setAttribute("aria-label", `Aktuální hodnota cíle ${c.nazev}`);
  pole.addEventListener("change", () => {
    const hodnota = Number(pole.value);
    pole.blur(); // ať se karta může překreslit s novou hodnotou
    if (Number.isFinite(hodnota) && hodnota >= 0) ulozCil({ ...c, aktualne: hodnota });
    else pole.value = c.aktualne || 0;
  });

  radek.append(minus, vytvorPlusJedna(c), pole);
  if (c.jednotka) radek.append(vytvor("span", "polozka-detail", c.jednotka));
  return radek;
}

// Cíl s kroky: zaškrtávací seznam kroků a pole na přidání dalšího
function vytvorKroky(c) {
  const obal = vytvor("div", "cil-kroky");
  const seznam = vytvor("ul", "cil-kroky-seznam");
  for (const krok of c.kroky || []) {
    const li = vytvor("li", "cil-krok");
    if (krok.hotovo) li.classList.add("hotovo");
    const zaskrtnout = vytvor("button", "zaskrtavatko");
    zaskrtnout.type = "button";
    zaskrtnout.setAttribute("role", "checkbox");
    zaskrtnout.setAttribute("aria-checked", Boolean(krok.hotovo));
    zaskrtnout.setAttribute("aria-label", krok.text);
    zaskrtnout.addEventListener("click", () =>
      ulozCil({ ...c, kroky: c.kroky.map((k) => (k.id === krok.id ? { ...k, hotovo: !k.hotovo } : k)) })
    );
    const smazat = vytvor("button", "odebrat-tlacitko", "×");
    smazat.type = "button";
    smazat.setAttribute("aria-label", `Smazat krok ${krok.text}`);
    smazat.addEventListener("click", () => ulozCil({ ...c, kroky: c.kroky.filter((k) => k.id !== krok.id) }));
    li.append(zaskrtnout, vytvor("span", "cil-krok-text", krok.text), smazat);
    seznam.append(li);
  }

  const formular = vytvor("form", "cil-novy-krok");
  const pole = vytvor("input", "");
  pole.placeholder = "Další krok…";
  pole.maxLength = 100;
  pole.setAttribute("aria-label", `Nový krok cíle ${c.nazev}`);
  const pridat = vytvor("button", "kulate-tlacitko maly", "+");
  pridat.type = "submit";
  pridat.setAttribute("aria-label", "Přidat krok");
  formular.append(pole, pridat);
  formular.addEventListener("submit", (udalost) => {
    udalost.preventDefault();
    const text = pole.value.trim();
    if (!text) return;
    pole.blur(); // ať se karta může překreslit
    ulozCil({ ...c, kroky: [...(c.kroky || []), { id: noveId(), text, hotovo: false }] });
  });

  obal.append(seznam, formular);
  return obal;
}

// Pole formuláře (nový cíl i úprava): název, typ, cílová hodnota, jednotka, termín
function vytvorPoleCile(c) {
  const pole = {};
  pole.nazev = vytvor("input", "");
  pole.nazev.placeholder = "Např. Přečíst 12 knih, Naučit se 500 slovíček…";
  pole.nazev.required = true;
  pole.nazev.maxLength = 100;
  pole.nazev.value = c?.nazev || "";
  pole.nazev.setAttribute("aria-label", "Název cíle");

  pole.cil = vytvor("input", "");
  pole.cil.type = "number";
  pole.cil.inputMode = "decimal";
  pole.cil.step = "any";
  pole.cil.min = 0;
  pole.cil.placeholder = "Kolik (např. 12)";
  pole.cil.value = c?.cil ?? "";
  pole.cil.setAttribute("aria-label", "Cílová hodnota");

  pole.jednotka = vytvor("input", "");
  pole.jednotka.placeholder = "Jednotka (knih, km, Kč…)";
  pole.jednotka.maxLength = 20;
  pole.jednotka.value = c?.jednotka || "";
  pole.jednotka.setAttribute("aria-label", "Jednotka");

  pole.termin = vytvor("input", "");
  pole.termin.type = "date";
  pole.termin.value = c?.termin || "";
  pole.termin.setAttribute("aria-label", "Termín (nepovinný)");
  return pole;
}

function vytvorFormularCile() {
  const formular = vytvor("form", "karta sekce cil-formular");
  formular.append(vytvor("h2", "", "Nový cíl"));
  let typ = "cislo";
  const pole = vytvorPoleCile(null);

  const typy = vytvor("div", "filtry");
  for (const [klic, popis] of [["cislo", "Číslo (např. 12 knih)"], ["kroky", "Kroky (seznam)"]]) {
    const tlacitko = vytvor("button", "filtr", popis);
    tlacitko.type = "button";
    tlacitko.dataset.typ = klic;
    tlacitko.addEventListener("click", () => {
      typ = klic;
      ukazTyp();
    });
    typy.append(tlacitko);
  }
  const cislo = vytvor("div", "ukol-pole");
  cislo.append(pole.cil, pole.jednotka);
  function ukazTyp() {
    for (const t of typy.children) t.classList.toggle("vybrany", t.dataset.typ === typ);
    cislo.hidden = typ !== "cislo";
    pole.cil.required = typ === "cislo";
  }

  const terminRadek = vytvor("label", "cil-termin");
  terminRadek.append("Termín (nepovinný)", pole.termin);
  const pridat = vytvor("button", "hlavni-tlacitko", "Přidat cíl");
  pridat.type = "submit";
  formular.append(pole.nazev, typy, cislo, terminRadek, pridat);
  ukazTyp();

  formular.addEventListener("submit", (udalost) => {
    udalost.preventDefault();
    const zaklad = { nazev: pole.nazev.value.trim(), termin: pole.termin.value || null, typ, vytvoreno: Date.now() };
    if (!zaklad.nazev) return;
    if (typ === "cislo") {
      const hodnota = Number(pole.cil.value);
      if (!(hodnota > 0)) return;
      ulozCil({ ...zaklad, cil: hodnota, aktualne: 0, jednotka: pole.jednotka.value.trim() });
    } else {
      ulozCil({ ...zaklad, kroky: [] }); // kroky se přidají přímo v kartě
    }
    formular.reset();
    ukazTyp();
  });
  return formular;
}

function vytvorUpravuCile(c) {
  const karta = vytvor("li", "cil-karta upravuje");
  const formular = vytvor("form", "cil-formular");
  const pole = vytvorPoleCile(c);
  formular.append(pole.nazev);
  if (c.typ === "cislo") {
    const cislo = vytvor("div", "ukol-pole");
    cislo.append(pole.cil, pole.jednotka);
    formular.append(cislo);
  }
  const terminRadek = vytvor("label", "cil-termin");
  terminRadek.append("Termín", pole.termin);
  const tlacitka = vytvor("div", "pripojeni-tlacitka");
  const ulozit = vytvor("button", "hlavni-tlacitko", "Uložit");
  ulozit.type = "submit";
  const zrusit = vytvor("button", "odkaz-tlacitko", "Zrušit");
  zrusit.type = "button";
  zrusit.addEventListener("click", () => {
    upravovanyCil = null;
    vykresliCile();
  });
  tlacitka.append(ulozit, zrusit);
  formular.append(terminRadek, tlacitka);

  formular.addEventListener("submit", (udalost) => {
    udalost.preventDefault();
    const zmeny = { nazev: pole.nazev.value.trim(), termin: pole.termin.value || null };
    if (!zmeny.nazev) return;
    if (c.typ === "cislo") {
      const hodnota = Number(pole.cil.value);
      if (!(hodnota > 0)) return;
      Object.assign(zmeny, { cil: hodnota, jednotka: pole.jednotka.value.trim() });
    }
    upravovanyCil = null;
    ulozCil({ ...c, ...zmeny });
  });
  karta.append(formular);
  setTimeout(() => pole.nazev.focus());
  return karta;
}

zobrazCile();
