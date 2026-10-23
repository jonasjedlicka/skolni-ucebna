// Modul CÍLE: cíle s ukazatelem pokroku, ukládané zašifrovaně na GitHub (js/zapisy.js).
// Dva druhy cílů:
//   číselný: { typ: "cislo", nazev, cil: 12, aktualne: 3, jednotka: "knih", termin? }
//   kroky:   { typ: "kroky", nazev, kroky: [{ id, text, hotovo }], termin? }
// Společné: vytvoreno, zmeneno, splnenoKdy (když je cíl na 100 %).

function cileZapisy() {
  return otevriZapisy("cile", "cíle");
}

// Kolik je hotovo z kolika: { hotovo, celkem, podil 0–1 }
function prubehCile(c) {
  if (c.typ === "kroky") {
    const celkem = (c.kroky || []).length;
    const hotovo = (c.kroky || []).filter((k) => k.hotovo).length;
    return { hotovo, celkem, podil: celkem ? hotovo / celkem : 0 };
  }
  const celkem = Number(c.cil) || 0;
  const hotovo = Number(c.aktualne) || 0;
  return { hotovo, celkem, podil: celkem ? Math.min(1, hotovo / celkem) : 0 };
}

function jeSplneny(c) {
  const p = prubehCile(c);
  return p.celkem > 0 && p.hotovo >= p.celkem;
}

// Uloží cíl a podle pokroku nastaví/zruší „splněno“
function ulozCil(c) {
  const splneny = jeSplneny(c);
  cileZapisy().uloz({ ...c, splnenoKdy: splneny ? c.splnenoKdy || Date.now() : null });
}

// Rozpracované podle termínu (bez termínu na konec), splněné od nejnovějšího
function serazeneCile() {
  const vsechny = cileZapisy().polozky();
  const aktivni = vsechny
    .filter((c) => !jeSplneny(c))
    .sort((a, b) => (a.termin || "9999").localeCompare(b.termin || "9999") || a.vytvoreno - b.vytvoreno);
  const splnene = vsechny.filter(jeSplneny).sort((a, b) => b.splnenoKdy - a.splnenoKdy);
  return { aktivni, splnene };
}

// 1 234,5 → "1 234,5"
function cislo(hodnota) {
  return Number(hodnota).toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
}

// Text pokroku: „3 z 12 knih“ / „2 z 5 kroků“
function textPrubehu(c) {
  const p = prubehCile(c);
  if (c.typ === "kroky") return `${p.hotovo} z ${p.celkem} kroků`;
  return `${cislo(p.hotovo)} z ${cislo(p.celkem)}${c.jednotka ? " " + c.jednotka : ""}`;
}

// Jak jsi na tom vůči termínu: když bys měl postupovat rovnoměrně od vytvoření
// cíle do termínu, kolik bys měl mít dnes? Vrátí text, nebo null.
function textTempa(c) {
  if (!c.termin || jeSplneny(c)) return null;
  const dny = dnyDo(parsujDatum(c.termin));
  if (dny < 0) return "po termínu";
  const termin = textZaKolik(dny);
  const p = prubehCile(c);
  const zacatek = new Date(c.vytvoreno);
  zacatek.setHours(0, 0, 0, 0);
  const celkemDni = Math.max(1, Math.round((parsujDatum(c.termin) - zacatek) / 864e5));
  const ocekavany = Math.min(1, (celkemDni - dny) / celkemDni);
  if (p.podil + 0.05 >= ocekavany) return `termín ${termin} · v plánu`;
  return `termín ${termin} · pozadu (podle plánu ${Math.round(ocekavany * 100)} %)`;
}

// Ukazatel pokroku: šedá dráha, bílá výplň, procenta vedle
function vytvorUkazatel(podil) {
  const obal = vytvor("div", "ukazatel");
  const draha = vytvor("div", "ukazatel-draha");
  draha.setAttribute("role", "progressbar");
  draha.setAttribute("aria-valuemin", 0);
  draha.setAttribute("aria-valuemax", 100);
  draha.setAttribute("aria-valuenow", Math.round(podil * 100));
  const vypln = vytvor("div", "ukazatel-vypln");
  vypln.style.width = podil * 100 + "%";
  draha.append(vypln);
  obal.append(draha, vytvor("span", "ukazatel-procenta", Math.round(podil * 100) + " %"));
  return obal;
}

// Tlačítko „+1“ u číselného cíle (Přehled i Plán)
function vytvorPlusJedna(c) {
  const tlacitko = vytvor("button", "filtr plus-jedna", "+1");
  tlacitko.type = "button";
  tlacitko.setAttribute("aria-label", `Přidat 1 k cíli ${c.nazev}`);
  tlacitko.addEventListener("click", () => ulozCil({ ...c, aktualne: (Number(c.aktualne) || 0) + 1 }));
  return tlacitko;
}

// Kompaktní řádek cíle: název, ukazatel a text pokroku
function vytvorRadekCile(c) {
  const polozka = vytvor("li", "polozka cil");
  const hlavni = vytvor("div", "polozka-hlavni");
  hlavni.append(vytvor("div", "polozka-nazev", c.nazev));
  hlavni.append(vytvorUkazatel(prubehCile(c).podil));
  const detail = [textPrubehu(c)];
  const tempo = textTempa(c);
  if (tempo) detail.push(tempo);
  hlavni.append(vytvor("div", "polozka-detail", detail.join(" · ")));
  polozka.append(hlavni);
  if (c.typ === "cislo") polozka.append(vytvorPlusJedna(c));
  return polozka;
}

// Dlaždice „Cíle“ na Přehledu: 3 rozpracované s nejbližším termínem
function vykresliCileDnes(obsah) {
  const seznam = vytvor("ul", "seznam");
  const dalsi = vytvor("p", "polozka-detail");
  obsah.append(seznam, dalsi);
  function prekresli() {
    const { aktivni } = serazeneCile();
    seznam.replaceChildren(
      ...(aktivni.length ? aktivni.slice(0, 3).map((c) => vytvorRadekCile(c)) : [vytvor("li", "slaby", "Žádné rozpracované cíle.")])
    );
    dalsi.textContent = aktivni.length > 3 ? `a ještě ${aktivni.length - 3} další` : "";
  }
  cileZapisy().naZmenu(prekresli);
  prekresli();
}

MODULY.push({
  id: "cile",
  zalozka: "plan",
  dnes: [{ nazev: "Cíle", odkaz: "plan.html#cile", poradi: 3.8, vykresli: vykresliCileDnes }],
});
