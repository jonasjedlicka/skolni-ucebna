// ZÁPISY: ukládání toho, co do dashboardu napíšeš (úkoly, poznámky, známky,
// trénink…) na server v Macu – do ~/Dashboard-data/zapisy/<nazev>.json.
// Mac i iPhone tak vidí stejná data.
//
// Jak to funguje:
//   - Každý druh zápisů je jeden soubor; server ho posílá a přijímá přes
//     /api/zapisy/<nazev> (jen přihlášenému).
//   - Kopie se drží i v prohlížeči, takže se stránka ukáže hned a změny se
//     neztratí, ani když se zrovna nejde spojit s Macem – odešlou se příště.
//   - Když něco změníš na dvou zařízeních zároveň, nic se nepřepíše:
//     u každé položky vyhraje ta novější verze (podle času změny).
//
// Uvnitř souboru: { polozky: { "<id>": { …, zmeneno: <čas v ms>, smazano?: true } } }
// Smazaná položka v souboru zůstane jen jako značka „smazano“, aby ji druhé
// zařízení nevrátilo zpátky.

const ULOZIT_PO_MS = 1000; // počkáme, až dopíšeš – ať se neukládá po každém písmenu

// --- Server ---

// Vrátí { data, verze } – verze je „otisk“ souboru. Server ji chce při zápisu,
// aby poznal, že nepřepisujeme novější verzi z jiného zařízení.
async function serverNacti(nazev) {
  const odpoved = await fetch(`/api/zapisy/${nazev}`, { cache: "no-store" });
  overPrihlaseni(odpoved);
  if (!odpoved.ok) throw new Error(`Server neodpovídá (chyba ${odpoved.status}).`);
  return odpoved.json();
}

// Zapíše zápisy. Vrátí { ok: true, verze } nebo { ok: false, data, verze },
// když mezitím jiné zařízení uložilo novější verzi.
async function serverUloz(nazev, data, verze) {
  const odpoved = await fetch(`/api/zapisy/${nazev}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, verze }),
  });
  overPrihlaseni(odpoved);
  if (odpoved.status === 409) return { ok: false, ...(await odpoved.json()) };
  if (!odpoved.ok) throw new Error(`Uložení se nepovedlo (chyba ${odpoved.status}).`);
  return { ok: true, ...(await odpoved.json()) };
}

// --- Spojení dvou verzí ---

// U každé položky vezme novější verzi. Funguje pro libovolný počet zařízení.
function spojZapisy(a, b) {
  const polozky = { ...a.polozky };
  for (const [id, polozka] of Object.entries(b.polozky)) {
    if (!polozky[id] || polozka.zmeneno > polozky[id].zmeneno) polozky[id] = polozka;
  }
  return { polozky };
}

// Porovnání obsahu bez ohledu na pořadí klíčů
function stejneZapisy(a, b) {
  const otisk = (z) => JSON.stringify(Object.keys(z.polozky).sort().map((id) => [id, z.polozky[id]]));
  return otisk(a) === otisk(b);
}

function noveId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// --- Sbírka zápisů ---

// Otevře jeden druh zápisů, např. otevriZapisy("poznamky").
// Vrátí objekt s funkcemi: polozky(), uloz(polozka), smaz(id), naZmenu(fn), naStav(fn).
// Když stejné zápisy chce víc míst na stránce, dostanou všechna tentýž objekt.
const otevreneZapisy = new Map();

function otevriZapisy(nazev) {
  if (!otevreneZapisy.has(nazev)) otevreneZapisy.set(nazev, vytvorZapisy(nazev));
  return otevreneZapisy.get(nazev);
}

function vytvorZapisy(nazev) {
  const klicKopie = "dashboard-zapisy-" + nazev;
  let data = { polozky: {} };
  let verze = null;
  let casovac = null;
  let ukladani = null; // právě běžící uložení (aby neběžela dvě naráz)
  let stav = { kod: "nacita", text: "Načítá se…" };
  const posluchaciZmeny = [];
  const posluchaciStavu = [];

  function nastavStav(kod, text) {
    stav = { kod, text };
    posluchaciStavu.forEach((fn) => fn(stav));
  }

  function oznamZmenu() {
    posluchaciZmeny.forEach((fn) => fn());
  }

  // Kopie v prohlížeči – zobrazí se hned, i bez spojení s Macem
  const ulozKopii = () => ulozDoProhlizece(klicKopie, data);
  const nactiKopii = () => nactiZProhlizece(klicKopie, { polozky: {} });

  function naplanujUlozeni() {
    nastavStav("uklada", "Ukládám…");
    clearTimeout(casovac);
    casovac = setTimeout(ulozNaServer, ULOZIT_PO_MS);
  }

  async function ulozNaServer() {
    casovac = null;
    if (ukladani) await ukladani; // ještě se ukládá předchozí změna – uložíme hned potom
    ukladani = (async () => {
      try {
        for (let pokus = 0; pokus < 3; pokus++) {
          const vysledek = await serverUloz(nazev, data, verze);
          if (vysledek.ok) {
            verze = vysledek.verze;
            nastavStav("ulozeno", "Uloženo");
            return;
          }
          // Jiné zařízení mezitím uložilo svou verzi → spojíme a zkusíme znovu
          data = spojZapisy(data, vysledek.data);
          verze = vysledek.verze;
          ulozKopii();
          oznamZmenu();
        }
        throw new Error("Nepodařilo se uložit, zkusím to znovu později.");
      } catch (chyba) {
        nastavStav("chyba", "Nejde se spojit s Macem – změny jsou v tomhle zařízení a odešlou se později.");
        console.error(chyba);
      } finally {
        ukladani = null;
      }
    })();
    return ukladani;
  }

  async function nacti() {
    const kopie = nactiKopii();
    data = kopie;
    oznamZmenu();
    try {
      const zeServeru = await serverNacti(nazev);
      verze = zeServeru.verze;
      data = spojZapisy(kopie, zeServeru.data);
      ulozKopii();
      oznamZmenu();
      if (!stejneZapisy(data, zeServeru.data)) {
        naplanujUlozeni(); // v kopii jsou neodeslané změny (např. z doby bez spojení)
      } else {
        nastavStav("ulozeno", "Uloženo");
      }
    } catch (chyba) {
      nastavStav("chyba", "Nejde se spojit s Macem – ukazuji kopii z tohoto zařízení.");
      console.error(chyba);
    }
  }

  // Změna v jiné kartě prohlížeče (sdílí stejnou kopii)
  window.addEventListener("storage", (udalost) => {
    if (udalost.key !== klicKopie) return;
    data = spojZapisy(data, nactiKopii());
    oznamZmenu();
  });

  // Při odchodu ze stránky se rozdělané uložení pokusíme dokončit hned
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && casovac) {
      clearTimeout(casovac);
      ulozNaServer();
    }
  });

  const hotovo = nacti();

  return {
    hotovo, // slib, který se splní po prvním načtení
    // Aktuální (nesmazané) položky jako pole
    polozky: () => Object.entries(data.polozky).filter(([, p]) => !p.smazano).map(([id, p]) => ({ id, ...p })),
    uloz(polozka) {
      const id = polozka.id || noveId();
      const { id: _, ...obsah } = polozka;
      data.polozky[id] = { ...obsah, zmeneno: Date.now() };
      ulozKopii();
      oznamZmenu();
      naplanujUlozeni();
      return id;
    },
    smaz(id) {
      data.polozky[id] = { smazano: true, zmeneno: Date.now() };
      ulozKopii();
      oznamZmenu();
      naplanujUlozeni();
    },
    naZmenu: (fn) => posluchaciZmeny.push(fn),
    aktualniStav: () => stav,
    naStav(fn) {
      posluchaciStavu.push(fn);
      fn(stav);
    },
    // Načíst znovu ze serveru (aktualizace dat, změny z jiného zařízení)
    async znovu() {
      await nacti();
    },
  };
}

// Řádek se stavem ukládání (do každé části se zápisy)
function vytvorStavZapisu(zapisy) {
  const radek = vytvor("div", "stav-zapisu");
  const text = vytvor("span", "");
  radek.append(text);
  zapisy.naStav((stav) => {
    text.textContent = stav.text;
    radek.dataset.kod = stav.kod; // ne data-stav – to používá zobrazStav
  });
  return radek;
}
