// OBNOVA DAT: u každého widgetu kolečko pro ruční aktualizaci a čas
// „před 5 min“, jedno tlačítko „Aktualizovat vše“ a automatická aktualizace
// na pozadí – každý widget ve svém intervalu (viz obnova v js/moduly/*.js).
//
// Když se aktualizace nepovede, widget si nechá stará data a jen ukáže
// „nepodařilo se aktualizovat“ – zbytek stránky běží dál.
// Na pozadí se aktualizuje jen viditelná stránka (ne v jiné kartě nebo
// na zamknutém telefonu), aby se zbytečně neplýtvalo limity API a baterií.

const obnovy = [];
const KONTROLA_OBNOVY_S = 30; // jak často kontrolujeme, jestli už je čas něco obnovit

// Zaregistruje obnovitelný widget a hned ho poprvé načte.
//   misto:         prvek, kam přijde čas a kolečko (hlavička widgetu)
//   kazdychMinut:  interval automatické aktualizace
//   obnov:         async funkce, která data načte a vykreslí; může vrátit
//                  Date = jak stará jsou data (jinak se bere „teď“)
//   kontejner:     kam ukázat chybu, když se nepovede už první načtení
//   maxStariHodin: starší data se označí jako zastaralá
function zaregistrujObnovu(nastaveni) {
  const o = { ...nastaveni, bezi: null, posledniPokus: 0, casDat: null, chyba: null };

  o.cas = vytvor("span", "obnova-cas");
  o.tlacitko = vytvor("button", "obnovit-tlacitko");
  o.tlacitko.type = "button";
  o.tlacitko.title = "Aktualizovat";
  o.tlacitko.setAttribute("aria-label", "Aktualizovat");
  o.tlacitko.append(vytvorIkonu("obnovit"));
  o.tlacitko.addEventListener("click", () => spustObnovu(o));
  o.misto.append(o.cas, o.tlacitko);

  obnovy.push(o);
  spustObnovu(o);
  return o;
}

function spustObnovu(o) {
  if (o.bezi) return o.bezi; // už se načítá – nečekat dvakrát
  o.posledniPokus = Date.now();
  o.tlacitko.classList.add("toci");
  o.tlacitko.setAttribute("aria-busy", "true");
  o.bezi = (async () => {
    try {
      const cas = await o.obnov();
      o.casDat = cas instanceof Date ? cas : new Date();
      o.chyba = null;
    } catch (chyba) {
      o.chyba = chyba;
      console.error(chyba);
      // Pořád se ukazuje jen „Načítá se…“ = nemáme co ukázat → chyba místo obsahu.
      // Jinak necháme stará data a chybu ukážeme jen u kolečka.
      if (o.kontejner?.querySelector(":scope > .nacitani")) ukazChybu(o.kontejner, chyba);
    } finally {
      o.tlacitko.classList.remove("toci");
      o.tlacitko.removeAttribute("aria-busy");
      o.bezi = null;
    }
  })();
  ukazCasObnovy(o);
  return o.bezi.then(() => ukazCasObnovy(o));
}

// Text u kolečka: „před 5 min“, „aktualizuji…“, nebo chyba
function ukazCasObnovy(o) {
  o.cas.classList.remove("zastarale", "obnova-chyba");
  o.cas.title = "";
  if (o.bezi) {
    o.cas.textContent = "aktualizuji…";
  } else if (o.chyba) {
    o.cas.textContent = "nepodařilo se aktualizovat" + (o.casDat ? ` · data ${textPredKolika(o.casDat.toISOString())}` : "");
    o.cas.classList.add("obnova-chyba");
    o.cas.title = o.chyba.message;
  } else if (o.casDat) {
    o.cas.textContent = textPredKolika(o.casDat.toISOString());
    if (o.maxStariHodin && (Date.now() - o.casDat) / 3600000 > o.maxStariHodin) {
      o.cas.textContent += " – zastaralé";
      o.cas.classList.add("zastarale");
      o.cas.title = "Data se dlouho neaktualizovala. Zkontroluj stahovací skript.";
    }
  }
}

// Kontrola na pozadí: posune časy („před 6 min“) a obnoví, co už je na řadě
function zkontrolujObnovy() {
  for (let i = obnovy.length - 1; i >= 0; i--) {
    if (!obnovy[i].misto.isConnected) obnovy.splice(i, 1); // widget zmizel ze stránky
  }
  const vidim = document.visibilityState === "visible";
  for (const o of obnovy) {
    if (vidim && !o.bezi && Date.now() - o.posledniPokus >= o.kazdychMinut * 60000) spustObnovu(o);
    else ukazCasObnovy(o);
  }
}

setInterval(zkontrolujObnovy, KONTROLA_OBNOVY_S * 1000);
// Po návratu do karty / odemčení telefonu hned zkontrolovat, co je staré
document.addEventListener("visibilitychange", zkontrolujObnovy);

// Tlačítko „Aktualizovat vše“ – obnoví všechny widgety na stránce najednou
function vytvorHlavniObnovu() {
  const tlacitko = vytvor("button", "filtr hlavni-obnova");
  tlacitko.type = "button";
  tlacitko.append(vytvorIkonu("obnovit"), vytvor("span", "", "Aktualizovat vše"));
  tlacitko.addEventListener("click", async () => {
    tlacitko.classList.add("toci");
    tlacitko.disabled = true;
    await Promise.all(obnovy.map(spustObnovu));
    tlacitko.classList.remove("toci");
    tlacitko.disabled = false;
  });
  return tlacitko;
}

// Čas dat podle data/<id>/stav.json (kdy je naposledy stáhl skript)
async function casZeStavu(id) {
  const { aktualizovano } = await nactiJson(`data/${id}/stav.json`);
  return new Date(aktualizovano);
}
