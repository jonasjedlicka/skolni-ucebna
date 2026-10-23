// Část Návyky v záložce Zdraví: dnešní odškrtnutí, posledních 7 dní
// (jde dodatečně odškrtnout zapomenutý den), přidání, úprava a smazání.
// Výpočty a ukládání jsou v js/moduly/navyky.js a js/zapisy.js.

let upravovanyNavyk = null;

function zobrazNavyky() {
  const misto = document.getElementById("navyky");
  const seznam = vytvor("ul", "seznam navyky-seznam");
  seznam.id = "navyky-seznam";
  misto.replaceChildren(vytvorStavZapisu(navykyZapisy()), seznam, vytvorFormularNavyku());
  navykyZapisy().naZmenu(vykresliNavyky);
  vykresliNavyky();
  // O půlnoci začne nový den – otevřená stránka se sama posune
  setInterval(vykresliNavyky, 10 * 60 * 1000);
}

function vykresliNavyky() {
  const seznam = document.getElementById("navyky-seznam");
  if (upravovanyNavyk && seznam.querySelector(".upravuje")) return; // nerušit rozepsanou úpravu
  const navyky = seznamNavyku();
  seznam.replaceChildren(
    ...(navyky.length ? navyky.map(vytvorKartuNavyku) : [vytvor("li", "slaby", "Zatím žádné návyky. Přidej první níž.")])
  );
}

// Karta: řádek s dneškem + tlačítka, pod tím posledních 7 dní
function vytvorKartuNavyku(navyk) {
  const karta = vytvor("li", "navyk-karta");
  const radek = vytvorRadekNavyku(navyk, "div");

  const upravit = vytvor("button", "odebrat-tlacitko ikonove");
  upravit.type = "button";
  upravit.title = "Upravit";
  upravit.setAttribute("aria-label", `Upravit ${navyk.nazev}`);
  upravit.append(vytvorIkonu("upravit"));
  upravit.addEventListener("click", () => {
    upravovanyNavyk = navyk.id;
    karta.replaceWith(vytvorUpravuNavyku(navyk));
  });

  const smazat = vytvor("button", "odebrat-tlacitko ikonove", "×");
  smazat.type = "button";
  smazat.title = "Smazat";
  smazat.setAttribute("aria-label", `Smazat ${navyk.nazev}`);
  smazat.addEventListener("click", () => {
    if (!confirm(`Smazat návyk „${navyk.nazev}“ i s celou historií?`)) return;
    for (const p of navykyZapisy().polozky()) {
      if (p.druh === "splneno" && p.navyk === navyk.id) navykyZapisy().smaz(p.id);
    }
    navykyZapisy().smaz(navyk.id);
  });
  radek.append(upravit, smazat);

  karta.append(radek, vytvorTydenNavyku(navyk));
  return karta;
}

// Posledních 7 dní: plný kroužek = splněno, prázdný = nesplněno, čárka = volno.
// Kliknutím jde zapomenutý den doplnit (nebo omyl vrátit).
function vytvorTydenNavyku(navyk) {
  const tyden = vytvor("div", "navyk-tyden");
  const splneno = splneneDny(navyk);
  for (let n = 6; n >= 0; n--) {
    const den = predDny(n);
    const tlacitko = vytvor("button", "navyk-den");
    tlacitko.type = "button";
    const naplanovano = maNaplanovano(navyk, den);
    const hotovo = splneno.has(datumKlic(den));
    tlacitko.classList.toggle("hotovo", hotovo);
    tlacitko.classList.toggle("volno", !naplanovano);
    tlacitko.classList.toggle("dnes", n === 0);
    tlacitko.setAttribute("aria-pressed", hotovo);
    const datum = den.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" });
    tlacitko.setAttribute("aria-label", `${datum}: ${hotovo ? "splněno" : naplanovano ? "nesplněno" : "volno"}`);
    tlacitko.append(vytvor("span", "navyk-den-nazev", NAZVY_DNU[denVTydnu(den)]), vytvor("span", "navyk-den-znacka"));
    tlacitko.addEventListener("click", () => prepniSplneni(navyk, den));
    tyden.append(tlacitko);
  }
  return tyden;
}

// Tlačítka Po–Ne pro výběr dnů (vybrané = bílé)
function vytvorVyberDnu(vybrane) {
  const dny = vytvor("div", "filtry vyber-dnu");
  VSECHNY_DNY.forEach((cislo) => {
    const tlacitko = vytvor("button", "filtr", NAZVY_DNU[cislo]);
    tlacitko.type = "button";
    tlacitko.setAttribute("aria-pressed", vybrane.includes(cislo));
    tlacitko.classList.toggle("vybrany", vybrane.includes(cislo));
    tlacitko.addEventListener("click", () => {
      const zapnout = !tlacitko.classList.contains("vybrany");
      tlacitko.classList.toggle("vybrany", zapnout);
      tlacitko.setAttribute("aria-pressed", zapnout);
    });
    tlacitko.dataset.den = cislo;
    dny.append(tlacitko);
  });
  dny.hodnota = () => [...dny.children].filter((t) => t.classList.contains("vybrany")).map((t) => Number(t.dataset.den));
  return dny;
}

function vytvorFormularNavyku() {
  const formular = vytvor("form", "karta sekce navyk-formular");
  formular.append(vytvor("h2", "", "Nový návyk"));
  const nazev = vytvor("input", "");
  nazev.placeholder = "Např. Číst 20 minut, Pít vodu…";
  nazev.required = true;
  nazev.maxLength = 80;
  nazev.setAttribute("aria-label", "Název návyku");
  const dny = vytvorVyberDnu(VSECHNY_DNY);
  const pridat = vytvor("button", "hlavni-tlacitko", "Přidat");
  pridat.type = "submit";
  formular.append(nazev, vytvor("p", "polozka-detail", "Které dny:"), dny, pridat);

  formular.addEventListener("submit", (udalost) => {
    udalost.preventDefault();
    const vybrane = dny.hodnota();
    if (!nazev.value.trim() || vybrane.length === 0) return;
    navykyZapisy().uloz({ druh: "navyk", nazev: nazev.value.trim(), dny: vybrane, vytvoreno: Date.now() });
    nazev.value = "";
  });
  return formular;
}

function vytvorUpravuNavyku(navyk) {
  const karta = vytvor("li", "navyk-karta upravuje");
  const formular = vytvor("form", "navyk-formular");
  const nazev = vytvor("input", "");
  nazev.value = navyk.nazev;
  nazev.required = true;
  nazev.setAttribute("aria-label", "Název návyku");
  const dny = vytvorVyberDnu(navyk.dny || VSECHNY_DNY);
  const tlacitka = vytvor("div", "pripojeni-tlacitka");
  const ulozit = vytvor("button", "hlavni-tlacitko", "Uložit");
  ulozit.type = "submit";
  const zrusit = vytvor("button", "odkaz-tlacitko", "Zrušit");
  zrusit.type = "button";
  zrusit.addEventListener("click", () => {
    upravovanyNavyk = null;
    vykresliNavyky();
  });
  tlacitka.append(ulozit, zrusit);
  formular.append(nazev, dny, tlacitka);
  formular.addEventListener("submit", (udalost) => {
    udalost.preventDefault();
    const vybrane = dny.hodnota();
    if (!nazev.value.trim() || vybrane.length === 0) return;
    upravovanyNavyk = null;
    navykyZapisy().uloz({ ...navyk, nazev: nazev.value.trim(), dny: vybrane });
  });
  karta.append(formular);
  setTimeout(() => nazev.focus());
  return karta;
}

zobrazNavyky();
