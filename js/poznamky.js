// Část Poznámky v záložce Plán: přidání, hledání, připnutí, úprava a smazání.
// Ukládání řeší js/zapisy.js, společné funkce js/moduly/poznamky.js.

let hledanyText = "";

function zobrazPoznamky() {
  const misto = document.getElementById("poznamky");
  const hledani = vytvor("input", "hledani");
  hledani.type = "search";
  hledani.placeholder = "Hledat v poznámkách";
  hledani.setAttribute("aria-label", "Hledat v poznámkách");
  hledani.addEventListener("input", () => {
    hledanyText = hledani.value.trim().toLocaleLowerCase("cs");
    vykresliPoznamky();
  });

  const seznam = vytvor("ul", "seznam poznamky-seznam");
  seznam.id = "poznamky-seznam";
  misto.replaceChildren(vytvorStavZapisu(poznamky()), vytvorPolePoznamky(3), hledani, seznam);

  poznamky().naZmenu(vykresliPoznamky);
  vykresliPoznamky();
}

function vykresliPoznamky() {
  const seznam = document.getElementById("poznamky-seznam");
  // Rozepsanou úpravu nepřekreslujeme – přišla by o text
  if (seznam.querySelector(".upravuje")) return;

  const vsechny = serazenePoznamky();
  const vybrane = vsechny.filter((p) => p.text.toLocaleLowerCase("cs").includes(hledanyText));
  if (vybrane.length === 0) {
    seznam.replaceChildren(vytvor("li", "slaby", vsechny.length ? "Nic nenalezeno." : "Zatím žádné poznámky."));
    return;
  }
  seznam.replaceChildren(...vybrane.map(vytvorPoznamku));
}

function vytvorPoznamku(p) {
  const polozka = vytvor("li", "polozka poznamka");
  if (p.pripnuto) polozka.classList.add("pripnuto");

  const hlavni = vytvor("div", "polozka-hlavni");
  hlavni.append(vytvor("div", "poznamka-text", p.text));
  const detail = [textKdyPoznamka(p.vytvoreno)];
  if (p.upraveno) detail.push("upraveno " + textKdyPoznamka(p.upraveno));
  if (p.pripnuto) detail.unshift("připnuto");
  hlavni.append(vytvor("div", "polozka-detail", detail.join(" · ")));

  const akce = vytvor("div", "poznamka-akce");
  akce.append(
    vytvorAkci(p.pripnuto ? "Odepnout" : "Připnout", () => poznamky().uloz({ ...p, pripnuto: !p.pripnuto })),
    vytvorAkci("Upravit", () => upravPoznamku(polozka, p)),
    vytvorAkci("Smazat", () => {
      if (confirm("Smazat poznámku?")) poznamky().smaz(p.id);
    })
  );
  polozka.append(hlavni, akce);
  return polozka;
}

function vytvorAkci(text, akce) {
  const tlacitko = vytvor("button", "odkaz-tlacitko", text);
  tlacitko.type = "button";
  tlacitko.addEventListener("click", akce);
  return tlacitko;
}

// Úprava přímo v seznamu: místo textu se objeví pole
function upravPoznamku(polozka, p) {
  polozka.classList.add("upravuje");
  const pole = vytvor("textarea", "");
  pole.value = p.text;
  pole.rows = Math.min(10, p.text.split("\n").length + 1);
  const ulozit = vytvorAkci("Uložit", () => {
    polozka.classList.remove("upravuje");
    const text = pole.value.trim();
    if (text && text !== p.text) poznamky().uloz({ ...p, text, upraveno: Date.now() });
    else vykresliPoznamky();
  });
  const zrusit = vytvorAkci("Zrušit", () => {
    polozka.classList.remove("upravuje");
    vykresliPoznamky();
  });
  const akce = vytvor("div", "poznamka-akce");
  akce.append(ulozit, zrusit);
  const hlavni = vytvor("div", "polozka-hlavni");
  hlavni.append(pole);
  polozka.replaceChildren(hlavni, akce);
  pole.focus();
}

zobrazPoznamky();
