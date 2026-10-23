// ZÁPISY: ukládání toho, co do dashboardu napíšeš (poznámky, později úkoly,
// návyky…), zašifrovaně na GitHub – takže je máš stejné na mobilu i v počítači.
//
// Jak to funguje:
//   - Každý druh zápisů je jeden soubor data/zapisy/<nazev>.enc.json,
//     zašifrovaný stejným heslem jako ostatní osobní data.
//   - Prohlížeč ho čte a zapisuje přes GitHub API. K zápisu potřebuje tvůj
//     token (vložíš ho jednou na každém zařízení, uloží se zašifrovaný).
//   - Kopie se drží i v prohlížeči, takže se stránka ukáže hned a změny
//     se neztratí, ani když zrovna nejde internet – odešlou se příště.
//   - Když něco změníš na dvou zařízeních zároveň, nic se nepřepíše:
//     u každé položky vyhraje ta novější verze (podle času změny).
//
// Uvnitř souboru: { polozky: { "<id>": { …, zmeneno: <čas v ms>, smazano?: true } } }
// Smazaná položka v souboru zůstane jen jako značka „smazano“, aby ji druhé
// zařízení nevrátilo zpátky.

const GITHUB_API = "https://api.github.com";
const GITHUB_REPOZITAR = "jonasjedlicka/skolni-ucebna";
const GITHUB_VETEV = "main";
const ZAPISY_SLOZKA = "data/zapisy/";
const TOKEN_V_PROHLIZECI = "ucebna-github-token";
const ULOZIT_PO_MS = 1500; // počkáme, až dopíšeš – ať není commit po každém písmenu

// --- Token ---

async function nactiToken() {
  try {
    const obal = localStorage.getItem(TOKEN_V_PROHLIZECI);
    if (!obal) return null;
    return (await desifruj(JSON.parse(obal), await ziskejKlic())).token;
  } catch {
    return null; // jiné heslo nebo poškozený záznam → jako by token nebyl
  }
}

async function ulozToken(token) {
  const obal = await sifruj({ token }, await ziskejKlic());
  localStorage.setItem(TOKEN_V_PROHLIZECI, JSON.stringify(obal));
}

function zapomenToken() {
  try {
    localStorage.removeItem(TOKEN_V_PROHLIZECI);
  } catch {
    // nebylo co mazat
  }
}

// --- GitHub API ---

function githubAdresa(cesta) {
  return `${GITHUB_API}/repos/${GITHUB_REPOZITAR}/contents/${cesta}`;
}

function githubHlavicky(token) {
  return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
}

// Text ↔ base64 včetně češtiny (btoa/atob samy umí jen anglickou abecedu)
function textDoBase64(text) {
  return doBase64(new TextEncoder().encode(text));
}

function textZBase64(base64) {
  return new TextDecoder().decode(zBase64(base64.replace(/\n/g, "")));
}

// Vrátí { obal, sha } – sha je „otisk“ verze souboru, GitHub ho chce při zápisu,
// aby poznal, že nepřepisujeme novější verzi z jiného zařízení.
async function githubNacti(cesta, token) {
  const odpoved = await fetch(`${githubAdresa(cesta)}?ref=${GITHUB_VETEV}`, {
    headers: githubHlavicky(token),
    cache: "no-store",
  });
  if (odpoved.status === 404) return { obal: null, sha: null }; // soubor ještě není
  if (odpoved.status === 401) throw new ChybaTokenu("GitHub token neplatí nebo vypršel.");
  if (!odpoved.ok) throw new Error(`GitHub neodpovídá (chyba ${odpoved.status}).`);
  const soubor = await odpoved.json();
  return { obal: JSON.parse(textZBase64(soubor.content)), sha: soubor.sha };
}

// Zapíše soubor. Vrátí nové sha, nebo null, když mezitím někdo soubor změnil.
async function githubUloz(cesta, obal, sha, token, zprava) {
  const odpoved = await fetch(githubAdresa(cesta), {
    method: "PUT",
    headers: githubHlavicky(token),
    body: JSON.stringify({
      message: zprava,
      content: textDoBase64(JSON.stringify(obal, null, 2) + "\n"),
      branch: GITHUB_VETEV,
      ...(sha ? { sha } : {}),
    }),
  });
  if (odpoved.status === 409 || odpoved.status === 422) return null; // kolize verzí
  if (odpoved.status === 401) throw new ChybaTokenu("GitHub token neplatí nebo vypršel.");
  if (odpoved.status === 403 || odpoved.status === 404) {
    throw new ChybaTokenu("Token nemá právo zapisovat (Contents: Read and write pro skolni-ucebna).");
  }
  if (!odpoved.ok) throw new Error(`Uložení na GitHub selhalo (chyba ${odpoved.status}).`);
  return (await odpoved.json()).content.sha;
}

class ChybaTokenu extends Error {}

// Ověří token: zkusí přes API sáhnout na veřejný soubor repozitáře
async function githubOverToken(token) {
  const odpoved = await fetch(`${githubAdresa("data/sifra.json")}?ref=${GITHUB_VETEV}`, {
    headers: githubHlavicky(token),
    cache: "no-store",
  });
  if (odpoved.status === 401 || odpoved.status === 403 || odpoved.status === 404) {
    throw new ChybaTokenu("Token nefunguje nebo nevidí repozitář skolni-ucebna.");
  }
  if (!odpoved.ok) throw new Error(`GitHub neodpovídá (chyba ${odpoved.status}).`);
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

// Otevře jeden druh zápisů, např. otevriZapisy("poznamky", "Poznámky").
// Vrátí objekt s funkcemi: polozky(), uloz(polozka), smaz(id), naZmenu(fn), naStav(fn).
// Když stejné zápisy chce víc míst na stránce, dostanou všechna tentýž objekt.
const otevreneZapisy = new Map();

function otevriZapisy(nazev, popis) {
  if (!otevreneZapisy.has(nazev)) otevreneZapisy.set(nazev, vytvorZapisy(nazev, popis));
  return otevreneZapisy.get(nazev);
}

function vytvorZapisy(nazev, popis) {
  const cesta = ZAPISY_SLOZKA + nazev + ".enc.json";
  const klicKopie = "ucebna-zapisy-" + nazev;
  let data = { polozky: {} };
  let sha = null;
  let token = null;
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

  // Kopie v prohlížeči (zašifrovaná) – zobrazí se hned, i bez internetu
  async function ulozKopii() {
    try {
      localStorage.setItem(klicKopie, JSON.stringify(await sifruj(data, await ziskejKlic())));
    } catch {
      // plné nebo zakázané úložiště – data jsou aspoň na GitHubu
    }
  }

  async function nactiKopii() {
    try {
      const obal = localStorage.getItem(klicKopie);
      return obal ? await desifruj(JSON.parse(obal), await ziskejKlic()) : null;
    } catch {
      return null;
    }
  }

  // Načte verzi z GitHubu. S tokenem přes API (vždy nejnovější), bez tokenu
  // z webu (jen čtení, může být o minutu pozadu).
  async function nactiVzdalene() {
    if (token) {
      const vysledek = await githubNacti(cesta, token);
      sha = vysledek.sha;
      return vysledek.obal ? await desifruj(vysledek.obal, await ziskejKlic()) : { polozky: {} };
    }
    const odpoved = await fetch(cesta, { cache: "no-store" });
    if (odpoved.status === 404) return { polozky: {} };
    if (!odpoved.ok) throw new Error(`Nepodařilo se načíst ${cesta} (chyba ${odpoved.status})`);
    return desifruj(await odpoved.json(), await ziskejKlic());
  }

  function naplanujUlozeni() {
    if (!token) {
      nastavStav("jen-cteni", "Uloženo jen v tomhle zařízení – připoj GitHub, ať se změny synchronizují.");
      return;
    }
    nastavStav("uklada", "Ukládám…");
    clearTimeout(casovac);
    casovac = setTimeout(ulozNaGithub, ULOZIT_PO_MS);
  }

  async function ulozNaGithub() {
    if (ukladani) {
      // Ještě se ukládá předchozí změna – uložíme znovu hned potom
      await ukladani;
    }
    ukladani = (async () => {
      try {
        for (let pokus = 0; pokus < 3; pokus++) {
          const obal = await sifruj(data, await ziskejKlic());
          const noveSha = await githubUloz(cesta, obal, sha, token, `Zápisy: ${popis}`);
          if (noveSha) {
            sha = noveSha;
            nastavStav("ulozeno", "Uloženo na GitHub");
            return;
          }
          // Jiné zařízení mezitím uložilo svou verzi → spojíme a zkusíme znovu
          const vzdalene = await nactiVzdalene();
          data = spojZapisy(data, vzdalene);
          await ulozKopii();
          oznamZmenu();
        }
        throw new Error("Nepodařilo se uložit, zkusím to znovu později.");
      } catch (chyba) {
        nastavStav(chyba instanceof ChybaTokenu ? "token" : "chyba", chyba.message);
      } finally {
        ukladani = null;
      }
    })();
    return ukladani;
  }

  async function nacti() {
    token = await nactiToken();
    const kopie = await nactiKopii();
    if (kopie) {
      data = kopie;
      oznamZmenu();
    }
    try {
      const vzdalene = await nactiVzdalene();
      const spojene = spojZapisy(kopie || { polozky: {} }, vzdalene);
      data = spojene;
      await ulozKopii();
      oznamZmenu();
      if (!stejneZapisy(spojene, vzdalene)) {
        naplanujUlozeni(); // v kopii jsou neodeslané změny (např. z doby bez internetu)
      } else {
        nastavStav(token ? "ulozeno" : "jen-cteni",
          token ? "Uloženo na GitHub" : "Jen pro čtení – připoj GitHub, ať můžeš ukládat odkudkoli.");
      }
    } catch (chyba) {
      nastavStav(chyba instanceof ChybaTokenu ? "token" : "chyba",
        (kopie ? "Ukazuji uloženou kopii. " : "") + chyba.message);
    }
  }

  // Změna v jiné kartě prohlížeče (sdílí stejnou kopii)
  window.addEventListener("storage", async (udalost) => {
    if (udalost.key !== klicKopie) return;
    const kopie = await nactiKopii();
    if (kopie) {
      data = spojZapisy(data, kopie);
      oznamZmenu();
    }
  });

  // Při odchodu ze stránky se rozdělané uložení pokusíme dokončit hned
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && casovac && token && stav.kod === "uklada") {
      clearTimeout(casovac);
      casovac = null;
      ulozNaGithub();
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
    naStav(fn) {
      posluchaciStavu.push(fn);
      fn(stav);
    },
    // Po připojení tokenu: načíst znovu a odeslat, co čeká
    async znovu() {
      await nacti();
    },
  };
}

// --- Připojení GitHubu (okno s návodem a polem pro token) ---

function pripojGithub() {
  return new Promise((hotovo) => {
    const okno = vytvor("dialog", "zamek pripojeni");
    const formular = vytvor("form", "");
    const nadpis = vytvor("h2", "zamek-nadpis");
    nadpis.append(vytvorIkonu("zamek"), "Připojit GitHub");
    formular.append(nadpis);

    formular.append(vytvor("p", "slaby", "Aby se zápisy ukládaly a byly stejné na všech zařízeních, potřebuje dashboard token – „klíč“, který smí měnit jen tenhle web."));
    const kroky = vytvor("ol", "pripojeni-kroky");
    const odkaz = vytvor("a", "", "github.com → nový token");
    odkaz.href = "https://github.com/settings/personal-access-tokens/new";
    odkaz.target = "_blank";
    odkaz.rel = "noopener";
    const krok1 = vytvor("li", "");
    krok1.append("Otevři ", odkaz, ".");
    kroky.append(
      krok1,
      vytvor("li", "", "Token name: dashboard-zapisy. Expiration: klidně 1 rok."),
      vytvor("li", "", "Repository access: Only select repositories → skolni-ucebna."),
      vytvor("li", "", "Permissions → Repository → Contents: Read and write."),
      vytvor("li", "", "Generate token, zkopíruj ho a vlož sem.")
    );
    formular.append(kroky);

    const pole = vytvor("input", "");
    pole.type = "password";
    pole.autocomplete = "off";
    pole.placeholder = "github_pat_…";
    pole.required = true;
    const zprava = vytvor("p", "chyba");
    const tlacitka = vytvor("div", "pripojeni-tlacitka");
    const ulozit = vytvor("button", "", "Připojit");
    ulozit.type = "submit";
    const zrusit = vytvor("button", "odkaz-tlacitko", "Zrušit");
    zrusit.type = "button";
    tlacitka.append(ulozit, zrusit);
    formular.append(pole, zprava, tlacitka);
    okno.append(formular);

    const zavri = (vysledek) => {
      okno.close();
      okno.remove();
      hotovo(vysledek);
    };
    zrusit.addEventListener("click", () => zavri(false));
    okno.addEventListener("cancel", () => zavri(false));

    formular.addEventListener("submit", async (udalost) => {
      udalost.preventDefault();
      const token = pole.value.trim();
      ulozit.disabled = true;
      zprava.textContent = "Ověřuji…";
      try {
        await githubOverToken(token);
        await ulozToken(token);
        zavri(true);
      } catch (chyba) {
        zprava.textContent = chyba instanceof ChybaTokenu ? "Token nefunguje. Zkontroluj, že jsi ho zkopíroval celý a že má přístup ke skolni-ucebna." : chyba.message;
        ulozit.disabled = false;
      }
    });

    document.body.append(okno);
    okno.showModal();
  });
}

// Řádek se stavem ukládání a tlačítkem „Připojit GitHub“ (do každé části se zápisy)
function vytvorStavZapisu(zapisy) {
  const radek = vytvor("div", "stav-zapisu");
  const text = vytvor("span", "");
  const tlacitko = vytvor("button", "odkaz-tlacitko", "Připojit GitHub");
  tlacitko.type = "button";
  tlacitko.addEventListener("click", async () => {
    if (await pripojGithub()) await zapisy.znovu();
  });
  radek.append(text, tlacitko);
  zapisy.naStav((stav) => {
    text.textContent = stav.text;
    radek.dataset.kod = stav.kod; // ne data-stav – to používá zobrazStav
    tlacitko.hidden = !["jen-cteni", "token"].includes(stav.kod);
  });
  return radek;
}
