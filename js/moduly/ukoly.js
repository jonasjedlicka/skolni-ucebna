// Modul ÚKOLY: školní i osobní úkoly s termíny, ukládané zašifrovaně na GitHub
// (js/zapisy.js). Úkol: { nazev, termin?, druh: "skola"|"osobni", predmet?,
// hotovo, hotovoKdy?, vytvoreno, zmeneno }. Termín je text "2026-11-02".

const DRUHY_UKOLU = { skola: "Škola", osobni: "Osobní" };

function ukoly() {
  return otevriZapisy("ukoly", "úkoly");
}

// Kolik dní do termínu (null = bez termínu)
function dnyDoTerminu(ukol) {
  return ukol.termin ? dnyDo(parsujDatum(ukol.termin)) : null;
}

// Nehotové podle termínu (bez termínu na konec), hotové od nejnovějšího
function serazeneUkoly(druh) {
  const vsechny = ukoly().polozky().filter((u) => !druh || u.druh === druh);
  const otevrene = vsechny
    .filter((u) => !u.hotovo)
    .sort((a, b) => (a.termin || "9999").localeCompare(b.termin || "9999") || a.vytvoreno - b.vytvoreno);
  const hotove = vsechny.filter((u) => u.hotovo).sort((a, b) => b.hotovoKdy - a.hotovoKdy);
  return { otevrene, hotove };
}

// „dnes“, „zítra“, „za 3 dny“, „2 dny po termínu“
function textTerminu(ukol) {
  const dny = dnyDoTerminu(ukol);
  if (dny === null) return "bez termínu";
  if (dny < 0) {
    const po = -dny;
    return po === 1 ? "včera – po termínu" : `${po} ${po <= 4 ? "dny" : "dní"} po termínu`;
  }
  return textZaKolik(dny);
}

function prepniHotovo(ukol) {
  ukoly().uloz({ ...ukol, hotovo: !ukol.hotovo, hotovoKdy: ukol.hotovo ? null : Date.now() });
}

// Jeden řádek úkolu: kroužek na odškrtnutí, název, termín a předmět.
// predmety = slovník předmětů (může být prázdný, když školní data nejsou k dispozici)
function vytvorRadekUkolu(ukol, predmety) {
  const polozka = vytvor("li", "polozka ukol");
  if (ukol.hotovo) polozka.classList.add("hotovo");

  const zaskrtnout = vytvor("button", "zaskrtavatko");
  zaskrtnout.type = "button";
  zaskrtnout.setAttribute("role", "checkbox");
  zaskrtnout.setAttribute("aria-checked", Boolean(ukol.hotovo));
  zaskrtnout.setAttribute("aria-label", `${ukol.hotovo ? "Vrátit" : "Hotovo"}: ${ukol.nazev}`);
  zaskrtnout.addEventListener("click", () => prepniHotovo(ukol));
  polozka.append(zaskrtnout);

  const hlavni = vytvor("div", "polozka-hlavni");
  hlavni.append(vytvor("div", "polozka-nazev", ukol.nazev));
  const detail = [DRUHY_UKOLU[ukol.druh]];
  if (ukol.predmet) detail.push(predmety[ukol.predmet]?.nazev || ukol.predmet);
  if (ukol.termin) detail.push(parsujDatum(ukol.termin).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" }));
  // Štítek s termínem je pod názvem (ne vpravo), aby na telefonu zbylo místo na název
  const radekDetailu = vytvor("div", "polozka-detail ukol-detail");
  if (!ukol.hotovo) {
    const dny = dnyDoTerminu(ukol);
    const stitek = vytvor("span", "stitek", textTerminu(ukol));
    if (dny !== null && dny <= 1) stitek.classList.add("brzy"); // dnes, zítra, po termínu
    radekDetailu.append(stitek);
  }
  radekDetailu.append(detail.join(" · "));
  hlavni.append(radekDetailu);
  polozka.append(hlavni);
  return polozka;
}

// Předměty pro výběr a názvy; bez hesla nebo dat prostě žádné
async function predmetyProUkoly() {
  try {
    return await nactiPredmety();
  } catch {
    return {};
  }
}

// Dlaždice „Úkoly“ na Přehledu: po termínu, dnes a zítra (max 5) + kolik dalších tento týden
async function vykresliUkolyDnes(obsah) {
  const seznam = vytvor("ul", "seznam");
  const dalsi = vytvor("p", "polozka-detail");
  obsah.append(seznam, dalsi);
  const predmety = await predmetyProUkoly();

  function prekresli() {
    const { otevrene } = serazeneUkoly();
    const naleha = otevrene.filter((u) => dnyDoTerminu(u) !== null && dnyDoTerminu(u) <= 1);
    const tydne = otevrene.filter((u) => dnyDoTerminu(u) > 1 && dnyDoTerminu(u) <= 7);
    seznam.replaceChildren(
      ...(naleha.length
        ? naleha.slice(0, 5).map((u) => vytvorRadekUkolu(u, predmety))
        : [vytvor("li", "slaby", "Na dnes a zítra nic nezbývá.")])
    );
    const zbyva = naleha.length - 5;
    const texty = [];
    if (zbyva > 0) texty.push(`a ještě ${zbyva} naléhavé`);
    if (tydne.length) texty.push(`${tydne.length} další tento týden`);
    dalsi.textContent = texty.join(" · ");
  }
  ukoly().naZmenu(prekresli);
  prekresli();
}

MODULY.push({
  id: "ukoly",
  zalozka: "plan",
  obnova: { kazdychMinut: 10, zapisy: ["ukoly"] }, // změny z jiného zařízení
  dnes: [{ nazev: "Úkoly", odkaz: "plan.html#ukoly", poradi: 1.5, vykresli: vykresliUkolyDnes }],
});
