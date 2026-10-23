// Společné funkce, které používají všechny stránky Učebny.
// Tenhle soubor se musí na stránce načíst jako první (před rozvrh.js atd.).

// Načte jeden JSON soubor a vrátí jeho obsah jako JavaScriptový objekt.
// "async" znamená, že funkce chvíli čeká (na odpověď serveru);
// "await" je místo, kde se čeká.
async function nactiJson(cesta) {
  const odpoved = await fetch(cesta);
  if (!odpoved.ok) {
    throw new Error(`Nepodařilo se načíst ${cesta} (chyba ${odpoved.status})`);
  }
  return odpoved.json();
}

// Načte předměty a vrátí je jako "slovník" podle id,
// takže pak stačí napsat predmety["matematika"] a máš celý předmět.
async function nactiPredmety() {
  const seznam = await nactiJson("data/predmety.json");
  const podleId = {};
  for (const predmet of seznam) {
    podleId[predmet.id] = predmet;
  }
  return podleId;
}

// Vytvoří HTML prvek, např. vytvor("div", "karta", "Ahoj")
// → <div class="karta">Ahoj</div>.
// Text vkládáme přes textContent, takže se nikdy nespustí jako kód.
function vytvor(znacka, trida, text) {
  const prvek = document.createElement(znacka);
  if (trida) prvek.className = trida;
  if (text !== undefined) prvek.textContent = text;
  return prvek;
}

// Převede text "2026-11-02" na datum.
// Nepoužíváme new Date("2026-11-02"), protože to prohlížeč bere
// jako půlnoc v Londýně (UTC), a u nás by to pak mohl být jiný den.
function parsujDatum(text) {
  const [rok, mesic, den] = text.split("-").map(Number);
  return new Date(rok, mesic - 1, den); // měsíce se v JS počítají od 0!
}

// Kolik dní zbývá od dneška do zadaného data (dnes = 0, zítra = 1, včera = -1).
function dnyDo(datum) {
  const dnes = new Date();
  dnes.setHours(0, 0, 0, 0); // vynulujeme čas, porovnáváme jen dny
  const MS_ZA_DEN = 24 * 60 * 60 * 1000;
  return Math.round((datum - dnes) / MS_ZA_DEN);
}

// Hezký text pro počet dní: „dnes“, „zítra“, „za 2 dny“, „za 5 dní“.
function textZaKolik(dny) {
  if (dny === 0) return "dnes";
  if (dny === 1) return "zítra";
  if (dny <= 4) return `za ${dny} dny`; // čeština: za 2, 3, 4 dny
  return `za ${dny} dní`;               // ale za 5 dní
}

// --- Rozvrh ---

// Dny v týdnu: "klic" musí odpovídat názvům v rozvrh.json.
const DNY = [
  { klic: "pondeli", nazev: "Pondělí" },
  { klic: "utery", nazev: "Úterý" },
  { klic: "streda", nazev: "Středa" },
  { klic: "ctvrtek", nazev: "Čtvrtek" },
  { klic: "patek", nazev: "Pátek" },
];

// Vrátí dnešní den z DNY, o víkendu undefined.
// getDay() vrací 0 = neděle, 1 = pondělí … 6 = sobota.
function dnesniDen() {
  return DNY[new Date().getDay() - 1];
}

// Jedna hodina v rozvrhu (používá ji rozvrh i úvodní stránka).
function vytvorHodinu(cislo, cas, hodina, predmet) {
  const polozka = vytvor("li", "polozka");
  polozka.append(vytvor("span", "polozka-cas", cas.od));

  const hlavni = vytvor("div", "polozka-hlavni");
  if (predmet) {
    // Barva proužku se bere z predmety.json (CSS proměnná --barva-predmetu)
    polozka.style.setProperty("--barva-predmetu", predmet.barva);
    const odkaz = vytvor("a", "polozka-nazev", predmet.nazev);
    odkaz.href = "predmet.html?id=" + predmet.id;
    hlavni.append(odkaz);
  } else {
    // Předmět v rozvrhu je, ale v predmety.json chybí → ukážeme aspoň jeho id
    hlavni.append(vytvor("div", "polozka-nazev", hodina.predmet));
  }
  hlavni.append(vytvor("div", "polozka-detail", `${cislo}. hodina · ${hodina.ucebna}`));

  polozka.append(hlavni);
  return polozka;
}

// --- Testy ---

// Testy, které jsou za tolik dní nebo dřív, se zvýrazní červeně.
const BRZY_DNI = 3;

// Z testů z testy.json nechá jen nadcházející, seřazené od nejbližšího:
// 1. ke každému dopočítá datum a kolik dní zbývá,
// 2. vyhodí ty, které už proběhly (dny < 0),
// 3. seřadí podle data.
function nadchazejiciTesty(testy) {
  return testy
    .map((test) => {
      const datum = parsujDatum(test.datum);
      return { ...test, datum, dny: dnyDo(datum) };
    })
    .filter((test) => test.dny >= 0)
    .sort((a, b) => a.datum - b.datum);
}

// Jeden test v seznamu (používá ho stránka testů i úvodní stránka).
function vytvorTest(test, predmet, casy) {
  const polozka = vytvor("li", "polozka");

  const hlavni = vytvor("div", "polozka-hlavni");
  if (predmet) {
    polozka.style.setProperty("--barva-predmetu", predmet.barva);
    const odkaz = vytvor("a", "polozka-nazev", predmet.nazev);
    odkaz.href = "predmet.html?id=" + predmet.id;
    hlavni.append(odkaz);
  } else {
    hlavni.append(vytvor("div", "polozka-nazev", test.predmet));
  }
  hlavni.append(vytvor("div", "", test.tema));

  // Např. „pondělí 2. 11. · 5. hodina (11:50) · Malá písemka“
  // toLocaleDateString umí napsat datum česky sám.
  const datumText = test.datum.toLocaleDateString("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
  });
  const casti = [datumText];
  if (test.hodina) {
    const cas = casy[test.hodina];
    casti.push(cas ? `${test.hodina}. hodina (${cas.od})` : `${test.hodina}. hodina`);
  }
  if (test.typ) casti.push(test.typ);
  hlavni.append(vytvor("div", "polozka-detail", casti.join(" · ")));
  polozka.append(hlavni);

  const stitek = vytvor("span", "stitek", textZaKolik(test.dny));
  if (test.dny <= BRZY_DNI) stitek.classList.add("brzy");
  polozka.append(stitek);

  return polozka;
}

// --- Předměty ---

// Dlaždice s odkazem na stránku předmětu (používá ji úvod i stránka předmětu).
function vytvorDlazdici(predmet) {
  const dlazdice = vytvor("a", "dlazdice");
  dlazdice.href = "predmet.html?id=" + predmet.id;
  dlazdice.style.setProperty("--barva-predmetu", predmet.barva);
  dlazdice.append(vytvor("div", "dlazdice-zkratka", predmet.zkratka));
  dlazdice.append(vytvor("div", "", predmet.nazev));
  return dlazdice;
}

// Když se něco pokazí, vypíše chybu přímo na stránku,
// abys hned viděl, co je špatně (a ne jen prázdnou stránku).
function ukazChybu(kontejner, chyba) {
  kontejner.replaceChildren(vytvor("p", "chyba", "⚠️ " + chyba.message));
  console.error(chyba);
}
