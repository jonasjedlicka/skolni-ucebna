// Část Trénink v záložce Zdraví: dnešní plán, zápis sérií, graf progresu,
// historie a týdenní plán. Data a výpočty jsou v js/moduly/trenink.js.

const DNI_HISTORIE = 10;
const VSECHNY_DNY_TRENINKU = [0, 1, 2, 3, 4, 5, 6];
const NAZVY_DNU_TRENINKU = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];
let vybranyCvik = null; // cvik v grafu progresu

function zobrazTrenink() {
  const misto = document.getElementById("trenink");
  const dnes = vytvor("div", "karta sekce");
  dnes.id = "trenink-dnes";
  const progres = vytvor("div", "karta sekce");
  progres.id = "trenink-progres";
  const historie = vytvor("details", "ukoly-hotove sekce");
  historie.id = "trenink-historie";
  const plan = vytvor("details", "karta sekce trenink-plan");
  plan.id = "trenink-plan";

  misto.replaceChildren(vytvorStavZapisu(treninkZapisy()), dnes, vytvorFormularSerie(), progres, historie, plan);
  treninkZapisy().naZmenu(vykresliTrenink);
  vykresliTrenink();
}

function vykresliTrenink() {
  vykresliDnesniTrenink();
  vykresliProgres();
  vykresliHistorii();
  // Plán nepřekreslujeme, když v něm zrovna píšeš
  if (!document.getElementById("trenink-plan").contains(document.activeElement)) vykresliPlan();
}

// --- Dnes: plán a zapsané série ---

function vykresliDnesniTrenink() {
  const karta = document.getElementById("trenink-dnes");
  const den = new Date().toLocaleDateString("cs-CZ", { weekday: "long" });
  const datum = datumKlic();
  const plan = dnesniPlan();
  const hotove = serieDne(datum);

  karta.replaceChildren(vytvor("h2", "", `Dnes · ${den}`));
  if (plan.length) {
    const ul = vytvor("ul", "seznam");
    for (const c of plan) {
      const radek = vytvorRadekCvikuDnes(c, hotove);
      // Klik na cvik z plánu ho předvyplní do zápisu (i s váhou z minula)
      radek.classList.add("klikatelny");
      radek.tabIndex = 0;
      radek.addEventListener("click", () => predvyplnCvik(c.cvik));
      radek.addEventListener("keydown", (u) => u.key === "Enter" && predvyplnCvik(c.cvik));
      ul.append(radek);
    }
    karta.append(ul);
  } else {
    karta.append(vytvor("p", "slaby", "Na dnešek nemáš plán – zapiš, co cvičíš, nebo si plán nastav dole."));
  }

  if (hotove.length) {
    karta.append(vytvor("p", "polozka-detail trenink-mezititulek", "Zapsané série"));
    const ul = vytvor("ul", "seznam");
    ul.append(...hotove.map(vytvorZapsanouSerii));
    karta.append(ul);
  }
}

function vytvorZapsanouSerii(s) {
  const polozka = vytvor("li", "polozka");
  const hlavni = vytvor("div", "polozka-hlavni");
  hlavni.append(vytvor("div", "polozka-nazev", s.cvik));
  hlavni.append(vytvor("div", "polozka-detail", textZapisuSerie(s)));
  const smazat = vytvor("button", "odebrat-tlacitko", "×");
  smazat.type = "button";
  smazat.title = "Smazat sérii";
  smazat.setAttribute("aria-label", `Smazat sérii ${s.cvik} ${textZapisuSerie(s)}`);
  smazat.addEventListener("click", () => treninkZapisy().smaz(s.id));
  polozka.append(hlavni, smazat);
  return polozka;
}

// --- Zápis série ---

function vytvorFormularSerie() {
  const formular = vytvor("form", "karta sekce cil-formular trenink-zapis");
  formular.id = "trenink-zapis";
  formular.append(vytvor("h2", "", "Zapsat sérii"));

  const nabidka = vytvor("datalist", "");
  nabidka.id = "trenink-cviky";
  const cvik = vytvorPopsanePoleTreninku("Cvik", "text");
  cvik.pole.required = true;
  cvik.pole.maxLength = 50;
  cvik.pole.setAttribute("list", nabidka.id);
  cvik.pole.name = "cvik";
  const vaha = vytvorPopsanePoleTreninku("Váha (kg, 0 = vlastní váha)", "number");
  vaha.pole.min = 0;
  vaha.pole.step = "0.5";
  vaha.pole.inputMode = "decimal";
  vaha.pole.name = "vaha";
  const opakovani = vytvorPopsanePoleTreninku("Opakování", "number");
  opakovani.pole.min = 1;
  opakovani.pole.max = 200;
  opakovani.pole.required = true;
  opakovani.pole.inputMode = "numeric";
  opakovani.pole.name = "opakovani";

  const cisla = vytvor("div", "ukol-pole");
  cisla.append(vaha.obal, opakovani.obal);
  const zapsat = vytvor("button", "hlavni-tlacitko", "Zapsat sérii");
  zapsat.type = "submit";
  const minule = vytvor("p", "polozka-detail");
  formular.append(nabidka, cvik.obal, cisla, zapsat, minule);

  // Po výběru cviku ukážeme, co bylo minule
  cvik.pole.addEventListener("change", () => ukazMinule(cvik.pole.value.trim(), minule));
  treninkZapisy().naZmenu(() => {
    nabidka.replaceChildren(...nazvyCviku().map((n) => new Option(n)));
  });
  nabidka.replaceChildren(...nazvyCviku().map((n) => new Option(n)));

  formular.addEventListener("submit", (udalost) => {
    udalost.preventDefault();
    const nazev = cvik.pole.value.trim();
    const pocet = Math.round(Number(opakovani.pole.value));
    if (!nazev || !(pocet > 0)) return;
    treninkZapisy().uloz({
      druh: "serie",
      datum: datumKlic(),
      cvik: nazev,
      vaha: Math.max(0, Number(vaha.pole.value) || 0),
      opakovani: pocet,
      cas: Date.now(),
    });
    // Cvik, váha i opakování zůstanou – další série bývá stejná, stačí znovu klepnout
    vybranyCvik = nazev;
    vykresliProgres();
  });
  return formular;
}

function ukazMinule(cvik, misto) {
  const minule = minuleSerie(cvik);
  misto.textContent = minule.length
    ? `Minule (${parsujDatum(minule[0].datum).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })}): ${minule.map(textZapisuSerie).join(", ")}`
    : "";
}

function predvyplnCvik(nazev) {
  const formular = document.getElementById("trenink-zapis");
  formular.cvik.value = nazev;
  const minule = minuleSerie(nazev);
  if (minule.length) {
    formular.vaha.value = minule.at(-1).vaha || "";
    formular.opakovani.value = minule.at(-1).opakovani;
  }
  ukazMinule(nazev, formular.querySelector(".polozka-detail:last-child"));
  formular.scrollIntoView({ behavior: "smooth", block: "center" });
  formular.opakovani.focus({ preventScroll: true });
}

function vytvorPopsanePoleTreninku(popis, typ) {
  const obal = vytvor("label", "cil-termin");
  const pole = vytvor("input", "");
  pole.type = typ;
  obal.append(popis, pole);
  return { obal, pole };
}

// --- Progres: graf nejtěžší série dne ---

function vykresliProgres() {
  const karta = document.getElementById("trenink-progres");
  const cviky = [...new Set(vsechnySerie().map((s) => s.cvik))].sort((a, b) => a.localeCompare(b, "cs"));
  karta.replaceChildren(vytvor("h2", "", "Progres"));
  if (cviky.length === 0) {
    karta.append(vytvor("p", "slaby", "Graf se ukáže po prvních zapsaných sériích."));
    return;
  }
  if (!cviky.includes(vybranyCvik)) vybranyCvik = cviky[0];

  const vyber = vytvor("select", "trenink-vyber");
  vyber.setAttribute("aria-label", "Cvik v grafu");
  for (const c of cviky) vyber.append(new Option(c, c));
  vyber.value = vybranyCvik;
  vyber.addEventListener("change", () => {
    vybranyCvik = vyber.value;
    vykresliProgres();
  });

  const body = progresCviku(vybranyCvik);
  const vlastniVaha = body.every((s) => !s.vaha);
  const hodnota = (s) => (vlastniVaha ? s.opakovani : s.vaha);
  const rekord = body.reduce((a, b) => (hodnota(b) > hodnota(a) || (hodnota(b) === hodnota(a) && b.opakovani > a.opakovani) ? b : a));
  const souhrn = vytvor("p", "polozka-detail");
  const zmena = hodnota(body.at(-1)) - hodnota(body[0]);
  const jednotka = vlastniVaha ? " opakování" : " kg";
  souhrn.textContent =
    `Rekord ${textZapisuSerie(rekord)} (${parsujDatum(rekord.datum).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })})` +
    (body.length > 1 ? ` · od začátku ${zmena >= 0 ? "▲ +" : "▼ "}${cisloKg(zmena)}${jednotka}` : "");

  karta.append(vyber, souhrn, vytvorGrafProgresu(body, hodnota, vlastniVaha));
}

// Čárový graf: osa x = tréninky (dny), osa y = váha (nebo opakování).
// Body jdou ťuknout/najet – nad grafem se ukáže přesná hodnota.
function vytvorGrafProgresu(body, hodnota, vlastniVaha) {
  const obal = vytvor("div", "trenink-graf");
  const popisek = vytvor("div", "trenink-graf-popisek");
  const ns = "http://www.w3.org/2000/svg";
  const S = 320, V = 160, OKRAJ = 12, OSA = 34; // rozměry ve viewBoxu
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${S} ${V}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Progres: ${body.map((b) => b.datum + " " + textZapisuSerie(b)).join(", ")}`);

  const hodnoty = body.map(hodnota);
  let min = Math.min(...hodnoty);
  let max = Math.max(...hodnoty);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const x = (i) => OSA + (body.length === 1 ? (S - OSA - OKRAJ) / 2 : (i / (body.length - 1)) * (S - OSA - OKRAJ));
  const y = (h) => OKRAJ + (1 - (h - min) / (max - min)) * (V - 2 * OKRAJ - 14);

  // Mřížka a popisky osy y (min a max) – nenápadně
  for (const h of [min, max]) {
    const cara = document.createElementNS(ns, "line");
    cara.setAttribute("x1", OSA);
    cara.setAttribute("x2", S - OKRAJ);
    cara.setAttribute("y1", y(h));
    cara.setAttribute("y2", y(h));
    cara.setAttribute("class", "graf-mrizka");
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", OSA - 6);
    text.setAttribute("y", y(h) + 4);
    text.setAttribute("text-anchor", "end");
    text.setAttribute("class", "graf-osa");
    text.textContent = cisloKg(h);
    svg.append(cara, text);
  }
  // Data na ose x: první a poslední trénink
  for (const i of body.length > 1 ? [0, body.length - 1] : [0]) {
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", x(i));
    text.setAttribute("y", V - 2);
    text.setAttribute("text-anchor", i === 0 && body.length > 1 ? "start" : "end");
    text.setAttribute("class", "graf-osa");
    text.textContent = parsujDatum(body[i].datum).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
    svg.append(text);
  }

  const cara = document.createElementNS(ns, "polyline");
  cara.setAttribute("points", body.map((b, i) => `${x(i)},${y(hodnota(b))}`).join(" "));
  cara.setAttribute("class", "graf-cara");
  svg.append(cara);

  const ukaz = (b) => {
    popisek.textContent = `${parsujDatum(b.datum).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" })}: ${textZapisuSerie(b)}`;
  };
  body.forEach((b, i) => {
    const bod = document.createElementNS(ns, "circle");
    bod.setAttribute("cx", x(i));
    bod.setAttribute("cy", y(hodnota(b)));
    bod.setAttribute("r", 4);
    bod.setAttribute("class", "graf-bod");
    // Větší neviditelný kruh = snazší trefa prstem
    const terc = document.createElementNS(ns, "circle");
    terc.setAttribute("cx", x(i));
    terc.setAttribute("cy", y(hodnota(b)));
    terc.setAttribute("r", 14);
    terc.setAttribute("class", "graf-terc");
    terc.addEventListener("pointerenter", () => ukaz(b));
    terc.addEventListener("click", () => ukaz(b));
    svg.append(bod, terc);
  });

  ukaz(body.at(-1)); // výchozí: poslední trénink
  obal.append(popisek, svg);
  if (body.length === 1) obal.append(vytvor("p", "slaby", "Po dalším tréninku se ukáže čára."));
  return obal;
}

// --- Historie posledních tréninků ---

function vykresliHistorii() {
  const sbaleno = document.getElementById("trenink-historie");
  const otevreno = sbaleno.open;
  const podleDni = new Map();
  for (const s of vsechnySerie()) {
    if (!podleDni.has(s.datum)) podleDni.set(s.datum, []);
    podleDni.get(s.datum).push(s);
  }
  const dny = [...podleDni.keys()].sort().reverse().slice(0, DNI_HISTORIE);
  const ul = vytvor("ul", "seznam");
  for (const den of dny) {
    const li = vytvor("li", "polozka");
    const hlavni = vytvor("div", "polozka-hlavni");
    const nazev = parsujDatum(den).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" });
    hlavni.append(vytvor("div", "polozka-nazev", nazev[0].toUpperCase() + nazev.slice(1)));
    // Série seskupené po cvicích: „Dřep: 60 kg × 8, 60 kg × 8“
    const poCvicich = new Map();
    for (const s of podleDni.get(den)) {
      if (!poCvicich.has(s.cvik)) poCvicich.set(s.cvik, []);
      poCvicich.get(s.cvik).push(textZapisuSerie(s));
    }
    for (const [cvik, serie] of poCvicich) hlavni.append(vytvor("div", "polozka-detail", `${cvik}: ${serie.join(", ")}`));
    li.append(hlavni);
    ul.append(li);
  }
  sbaleno.replaceChildren(vytvor("summary", "", `Historie (${podleDni.size} ${podleDni.size === 1 ? "trénink" : podleDni.size <= 4 ? "tréninky" : "tréninků"})`), ul);
  sbaleno.hidden = podleDni.size === 0;
  sbaleno.open = otevreno;
}

// --- Týdenní plán ---

function vykresliPlan() {
  const sbaleno = document.getElementById("trenink-plan");
  const otevreno = sbaleno.open;
  sbaleno.replaceChildren(vytvor("summary", "", "Týdenní plán"));
  sbaleno.append(vytvor("p", "polozka-detail", "Na každý den si napiš cviky, počet sérií a opakování. Změny se ukládají samy."));
  for (const den of VSECHNY_DNY_TRENINKU) sbaleno.append(vytvorDenPlanu(den));
  sbaleno.open = otevreno;
}

function vytvorDenPlanu(den) {
  const blok = vytvor("div", "plan-den");
  blok.append(vytvor("div", "polozka-nazev", NAZVY_DNU_TRENINKU[den]));
  const radky = vytvor("div", "plan-radky");
  const cviky = planDne(den);

  const uloz = () => {
    const nove = [...radky.children]
      .map((r) => ({
        cvik: r.querySelector(".plan-cvik").value.trim(),
        serie: Math.max(1, Math.round(Number(r.querySelector(".plan-serie").value)) || 3),
        opakovani: r.querySelector(".plan-opakovani").value.trim(),
      }))
      .filter((c) => c.cvik);
    treninkZapisy().uloz({ id: "plan-" + den, druh: "plan", den, cviky: nove });
  };

  const pridejRadek = (c = { cvik: "", serie: 3, opakovani: "8–10" }) => {
    const radek = vytvor("div", "plan-radek");
    const cvik = vytvor("input", "plan-cvik");
    cvik.value = c.cvik;
    cvik.placeholder = "Cvik";
    cvik.setAttribute("list", "trenink-cviky");
    cvik.setAttribute("aria-label", `Cvik (${NAZVY_DNU_TRENINKU[den]})`);
    const serie = vytvor("input", "plan-serie");
    serie.type = "number";
    serie.min = 1;
    serie.max = 20;
    serie.value = c.serie;
    serie.setAttribute("aria-label", "Počet sérií");
    const krat = vytvor("span", "polozka-detail", "×");
    const opakovani = vytvor("input", "plan-opakovani");
    opakovani.value = c.opakovani;
    opakovani.placeholder = "8–10";
    opakovani.setAttribute("aria-label", "Opakování");
    const smazat = vytvor("button", "odebrat-tlacitko", "×");
    smazat.type = "button";
    smazat.setAttribute("aria-label", "Odebrat cvik z plánu");
    smazat.addEventListener("click", () => {
      radek.remove();
      uloz();
    });
    for (const pole of [cvik, serie, opakovani]) pole.addEventListener("change", uloz);
    radek.append(cvik, serie, krat, opakovani, smazat);
    radky.append(radek);
    return cvik;
  };
  cviky.forEach((c) => pridejRadek(c));

  const pridat = vytvor("button", "odkaz-tlacitko plan-pridat", "+ přidat cvik");
  pridat.type = "button";
  pridat.addEventListener("click", () => pridejRadek().focus());
  blok.append(radky, pridat);
  return blok;
}

zobrazTrenink();
