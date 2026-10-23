// Modul POZNÁMKY: rychlé poznámky, ukládané na server v Macu (js/zapisy.js).
// Poznámka: { text, pripnuto, vytvoreno, upraveno?, zmeneno }

function poznamky() {
  return otevriZapisy("poznamky", "poznámky");
}

// Připnuté nahoře, jinak nejnovější první
function serazenePoznamky() {
  return poznamky()
    .polozky()
    .sort((a, b) => (b.pripnuto === true) - (a.pripnuto === true) || b.vytvoreno - a.vytvoreno);
}

function pridejPoznamku(text) {
  const cisty = text.trim();
  if (!cisty) return null;
  return poznamky().uloz({ text: cisty, pripnuto: false, vytvoreno: Date.now() });
}

// „dnes 14:05“, „včera 9:30“, „12. 10.“
function textKdyPoznamka(cas) {
  const datum = new Date(cas);
  const dny = -dnyDo(new Date(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const hodiny = datum.toLocaleTimeString("cs-CZ", { hour: "numeric", minute: "2-digit" });
  if (dny === 0) return `dnes ${hodiny}`;
  if (dny === 1) return `včera ${hodiny}`;
  return datum.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: dny > 300 ? "numeric" : undefined });
}

// Políčko „Nová poznámka…“ + tlačítko (Přehled i Plán).
// Enter uloží; Shift+Enter udělá nový řádek.
function vytvorPolePoznamky(radku) {
  const formular = vytvor("form", "nova-poznamka");
  const pole = vytvor("textarea", "");
  pole.rows = radku;
  pole.placeholder = "Nová poznámka…";
  pole.setAttribute("aria-label", "Nová poznámka");
  const tlacitko = vytvor("button", "kulate-tlacitko maly", "+");
  tlacitko.type = "submit";
  tlacitko.setAttribute("aria-label", "Uložit poznámku");
  formular.append(pole, tlacitko);

  formular.addEventListener("submit", (udalost) => {
    udalost.preventDefault();
    if (pridejPoznamku(pole.value)) pole.value = "";
    pole.focus();
  });
  pole.addEventListener("keydown", (udalost) => {
    if (udalost.key === "Enter" && !udalost.shiftKey && !udalost.isComposing) {
      udalost.preventDefault();
      formular.requestSubmit();
    }
  });
  return formular;
}

// Dlaždice „Poznámky“ na Přehledu: rychlé přidání a 3 poznámky (připnuté první)
function vykresliPoznamkyDnes(obsah) {
  const seznam = vytvor("ul", "seznam");
  seznam.style.marginTop = "10px";
  obsah.append(vytvorPolePoznamky(1), seznam);

  function prekresli() {
    const vybrane = serazenePoznamky().slice(0, 3);
    seznam.replaceChildren(
      ...vybrane.map((p) => {
        const polozka = vytvor("li", "polozka poznamka-kratka");
        if (p.pripnuto) polozka.classList.add("pripnuto");
        polozka.append(vytvor("div", "poznamka-text", p.text));
        return polozka;
      })
    );
  }
  poznamky().naZmenu(prekresli);
  prekresli();
}

MODULY.push({
  id: "poznamky",
  zalozka: "plan",
  obnova: { kazdychMinut: 10, zapisy: ["poznamky"] }, // změny z jiného zařízení
  dnes: [{ nazev: "Poznámky", odkaz: "plan.html#poznamky", poradi: 3.7, vykresli: vykresliPoznamkyDnes }],
});
