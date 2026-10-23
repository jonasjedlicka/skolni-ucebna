// Část Úkoly – v Plánu (všechny úkoly) i ve Škole (jen školní).
// Na stránce stačí <div id="ukoly"></div>; data-druh="skola" ukáže jen školní.
// Data a řádek úkolu jsou v js/moduly/ukoly.js, ukládání v js/zapisy.js.

const SKUPINY_UKOLU = [
  { nazev: "Po termínu", patri: (dny) => dny !== null && dny < 0 },
  { nazev: "Dnes", patri: (dny) => dny === 0 },
  { nazev: "Zítra", patri: (dny) => dny === 1 },
  { nazev: "Tento týden", patri: (dny) => dny > 1 && dny <= 7 },
  { nazev: "Později", patri: (dny) => dny > 7 },
  { nazev: "Bez termínu", patri: (dny) => dny === null },
];
const HOTOVYCH_NAJEDNOU = 20;

async function zobrazUkoly() {
  const misto = document.getElementById("ukoly");
  if (!misto) return;
  const pevnyDruh = misto.dataset.druh || null; // ve Škole jen "skola"
  let filtr = pevnyDruh;
  let upravovane = null; // id úkolu, který se právě upravuje
  const predmety = await predmetyProUkoly();

  const seznam = vytvor("div", "ukoly-skupiny");
  const hotove = vytvor("details", "ukoly-hotove");
  const filtry = vytvor("div", "filtry");

  if (!pevnyDruh) {
    for (const [druh, nazev] of [[null, "Vše"], ["skola", "Škola"], ["osobni", "Osobní"]]) {
      const tlacitko = vytvor("button", "filtr", nazev);
      tlacitko.type = "button";
      tlacitko.addEventListener("click", () => {
        filtr = druh;
        prekresli();
      });
      tlacitko.dataset.druh = druh || "";
      filtry.append(tlacitko);
    }
  }

  misto.replaceChildren(
    vytvorStavZapisu(ukoly()),
    vytvorFormularUkolu(pevnyDruh, predmety),
    ...(pevnyDruh ? [] : [filtry]),
    seznam,
    hotove
  );

  function prekresli() {
    // Rozepsanou úpravu nepřekreslujeme – přišla by o text
    if (upravovane && seznam.querySelector(".upravuje")) return;
    for (const tlacitko of filtry.children) {
      tlacitko.classList.toggle("vybrany", (tlacitko.dataset.druh || null) === filtr);
    }

    const { otevrene, hotove: hotoveUkoly } = serazeneUkoly(filtr);
    const skupiny = SKUPINY_UKOLU.map((s) => ({ ...s, ukoly: otevrene.filter((u) => s.patri(dnyDoTerminu(u))) }))
      .filter((s) => s.ukoly.length);
    seznam.replaceChildren(
      ...(skupiny.length
        ? skupiny.map((s) => {
            const sekce = vytvor("section", "sekce");
            sekce.append(vytvor("h2", "", s.nazev));
            const ul = vytvor("ul", "seznam");
            ul.append(...s.ukoly.map(vytvorUkolSAkcemi));
            sekce.append(ul);
            return sekce;
          })
        : [vytvor("p", "slaby", "Žádné úkoly. Přidej první nahoře.")])
    );

    // Hotové: sbalené, nejnovější nahoře
    hotove.hidden = hotoveUkoly.length === 0;
    const souhrn = vytvor("summary", "", `Hotové (${hotoveUkoly.length})`);
    const ul = vytvor("ul", "seznam");
    ul.append(...hotoveUkoly.slice(0, HOTOVYCH_NAJEDNOU).map(vytvorUkolSAkcemi));
    const smazat = vytvor("button", "odkaz-tlacitko", "Smazat všechny hotové");
    smazat.type = "button";
    smazat.addEventListener("click", () => {
      if (confirm(`Smazat ${hotoveUkoly.length} hotových úkolů?`)) hotoveUkoly.forEach((u) => ukoly().smaz(u.id));
    });
    const otevreno = hotove.open;
    hotove.replaceChildren(souhrn, ul, smazat);
    hotove.open = otevreno;
  }

  // Řádek + tlačítka Upravit a ×
  function vytvorUkolSAkcemi(ukol) {
    const radek = vytvorRadekUkolu(ukol, predmety);
    const upravit = vytvor("button", "odebrat-tlacitko ukol-upravit");
    upravit.type = "button";
    upravit.title = "Upravit";
    upravit.setAttribute("aria-label", `Upravit ${ukol.nazev}`);
    upravit.append(vytvorIkonu("upravit"));
    upravit.addEventListener("click", () => {
      upravovane = ukol.id;
      radek.replaceWith(vytvorUpravuUkolu(ukol));
    });
    const smazat = vytvor("button", "odebrat-tlacitko", "×");
    smazat.type = "button";
    smazat.title = "Smazat";
    smazat.setAttribute("aria-label", `Smazat ${ukol.nazev}`);
    smazat.addEventListener("click", () => {
      if (confirm(`Smazat úkol „${ukol.nazev}“?`)) ukoly().smaz(ukol.id);
    });
    radek.append(upravit, smazat);
    return radek;
  }

  // Úprava přímo v seznamu: název a termín
  function vytvorUpravuUkolu(ukol) {
    const polozka = vytvor("li", "polozka ukol upravuje");
    const formular = vytvor("form", "ukol-uprava");
    const nazev = vytvor("input", "");
    nazev.value = ukol.nazev;
    nazev.required = true;
    nazev.setAttribute("aria-label", "Název úkolu");
    const termin = vytvor("input", "");
    termin.type = "date";
    termin.value = ukol.termin || "";
    termin.setAttribute("aria-label", "Termín");
    const ulozit = vytvor("button", "hlavni-tlacitko", "Uložit");
    ulozit.type = "submit";
    const zrusit = vytvor("button", "odkaz-tlacitko", "Zrušit");
    zrusit.type = "button";
    const konec = () => {
      upravovane = null;
      prekresli();
    };
    zrusit.addEventListener("click", konec);
    formular.addEventListener("submit", (udalost) => {
      udalost.preventDefault();
      upravovane = null;
      ukoly().uloz({ ...ukol, nazev: nazev.value.trim(), termin: termin.value || null });
    });
    formular.append(nazev, termin, ulozit, zrusit);
    polozka.append(formular);
    setTimeout(() => nazev.focus());
    return polozka;
  }

  ukoly().naZmenu(prekresli);
  prekresli();
  // O půlnoci se „zítra“ změní na „dnes“ – otevřená stránka se sama přeskupí
  setInterval(prekresli, 10 * 60 * 1000);
}

// Formulář nahoře: název, termín, Škola/Osobní a u školy předmět
function vytvorFormularUkolu(pevnyDruh, predmety) {
  const formular = vytvor("form", "karta sekce ukol-formular");
  let druh = pevnyDruh || "skola";

  const nazev = vytvor("input", "");
  nazev.placeholder = "Nový úkol…";
  nazev.required = true;
  nazev.maxLength = 140;
  nazev.setAttribute("aria-label", "Nový úkol");

  const termin = vytvor("input", "");
  termin.type = "date";
  termin.setAttribute("aria-label", "Termín (nepovinný)");

  const predmet = vytvor("select", "");
  predmet.setAttribute("aria-label", "Předmět");
  predmet.append(new Option("Předmět (nepovinné)", ""));
  for (const p of Object.values(predmety)) predmet.append(new Option(p.nazev, p.id));

  const druhy = vytvor("div", "filtry ukol-druhy");
  if (!pevnyDruh) {
    for (const [klic, popis] of Object.entries(DRUHY_UKOLU)) {
      const tlacitko = vytvor("button", "filtr", popis);
      tlacitko.type = "button";
      tlacitko.dataset.druh = klic;
      tlacitko.addEventListener("click", () => {
        druh = klic;
        ukazDruh();
      });
      druhy.append(tlacitko);
    }
  }
  function ukazDruh() {
    for (const tlacitko of druhy.children) tlacitko.classList.toggle("vybrany", tlacitko.dataset.druh === druh);
    predmet.hidden = druh !== "skola" || predmet.options.length <= 1;
  }

  const pridat = vytvor("button", "hlavni-tlacitko", "Přidat");
  pridat.type = "submit";

  const pole = vytvor("div", "ukol-pole");
  pole.append(termin, predmet);
  formular.append(nazev, pole, ...(pevnyDruh ? [] : [druhy]), pridat);
  ukazDruh();

  formular.addEventListener("submit", (udalost) => {
    udalost.preventDefault();
    const text = nazev.value.trim();
    if (!text) return;
    ukoly().uloz({
      nazev: text,
      termin: termin.value || null,
      druh,
      predmet: druh === "skola" && predmet.value ? predmet.value : null,
      hotovo: false,
      vytvoreno: Date.now(),
    });
    nazev.value = "";
    termin.value = "";
    predmet.value = "";
    nazev.focus();
  });
  return formular;
}

zobrazUkoly();
