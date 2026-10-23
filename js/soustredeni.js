// Část Soustředění v záložce Plán: velký odpočet, ovládání, nastavení,
// přehled za týden a režim soustředění přes celou obrazovku.
// Logika odpočtu (stav, fáze, historie) je v js/moduly/soustredeni.js.

const OBVOD_KRUHU = 2 * Math.PI * 90; // kruh v SVG má poloměr 90

let stavPomodora = nactiPomodoro();
let zamekObrazovky = null; // Wake Lock: v režimu soustředění nenechá displej zhasnout

function zobrazSoustredeni() {
  vytvorKruh();
  nastavTlacitka();
  nastavNastaveni();
  obnovSoustredeni();
  setInterval(obnovSoustredeni, 1000);

  // Změna v jiné kartě (např. Spustit na Přehledu) se projeví i tady
  window.addEventListener("storage", (udalost) => {
    if (udalost.key === POMODORO_KLIC || udalost.key === POMODORO_HISTORIE_KLIC) {
      stavPomodora = nactiPomodoro();
      obnovSoustredeni();
    }
  });
}

// Kruh, který se s ubíhajícím časem „vybarvuje“ bílou čarou
function vytvorKruh() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 200 200");
  svg.setAttribute("class", "pomodoro-kruh");
  svg.setAttribute("aria-hidden", "true");
  for (const trida of ["pomodoro-kruh-podklad", "pomodoro-kruh-prubeh"]) {
    const kruh = document.createElementNS(ns, "circle");
    kruh.setAttribute("cx", 100);
    kruh.setAttribute("cy", 100);
    kruh.setAttribute("r", 90);
    kruh.setAttribute("class", trida);
    svg.append(kruh);
  }
  document.getElementById("pomodoro-cifernik").prepend(svg);
}

function nastavTlacitka() {
  document.getElementById("pomodoro-reset").append(vytvorIkonu("znovu"));
  document.getElementById("pomodoro-preskocit").append(vytvorIkonu("preskocit"));

  document.getElementById("pomodoro-start").addEventListener("click", () => {
    stavPomodora = nactiPomodoro(); // kdyby se mezitím změnil v jiné kartě
    if (bezi(stavPomodora)) {
      pozastavPomodoro(stavPomodora);
    } else {
      pozadejOUpozorneni();
      spustPomodoro(stavPomodora);
    }
    obnovSoustredeni();
  });

  document.getElementById("pomodoro-preskocit").addEventListener("click", () => {
    stavPomodora = nactiPomodoro();
    dalsiFaze(stavPomodora, false); // přeskočená práce se do historie nepočítá
    obnovSoustredeni();
  });

  document.getElementById("pomodoro-reset").addEventListener("click", () => {
    resetujPomodoro(stavPomodora);
    obnovSoustredeni();
  });

  document.getElementById("rezim-zapnout").addEventListener("click", zapniRezim);
  document.getElementById("rezim-vypnout").addEventListener("click", vypniRezim);
  document.addEventListener("keydown", (udalost) => {
    if (udalost.key === "Escape") vypniRezim();
  });
  // Když uživatel opustí celou obrazovku sám (gesto, Esc), ukončíme i režim
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) vypniRezim();
  });
  // Zámek displeje se při přepnutí aplikace ztratí – po návratu ho obnovíme
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && document.body.classList.contains("rezim-soustredeni")) {
      drzDisplej();
    }
  });
}

// --- Režim soustředění: jen odpočet přes celou obrazovku, nic jiného ---

async function zapniRezim() {
  document.body.classList.add("rezim-soustredeni");
  // Celá obrazovka: na počítači a Androidu ano, iPhone ji u stránek neumí –
  // tam aspoň schováme všechno kolem (třída rezim-soustredeni).
  try {
    await document.documentElement.requestFullscreen?.();
  } catch {
    // nevadí
  }
  drzDisplej();
}

function vypniRezim() {
  if (!document.body.classList.contains("rezim-soustredeni")) return;
  document.body.classList.remove("rezim-soustredeni");
  if (document.fullscreenElement) document.exitFullscreen();
  zamekObrazovky?.release();
  zamekObrazovky = null;
}

async function drzDisplej() {
  try {
    zamekObrazovky = await navigator.wakeLock?.request("screen");
  } catch {
    // Prohlížeč to neumí nebo nedovolil – displej zhasne podle systému
  }
}

// --- Nastavení délek ---

function nastavNastaveni() {
  for (const pole of document.querySelectorAll("#pomodoro-nastaveni input")) {
    pole.value = stavPomodora.nastaveni[pole.name];
    pole.addEventListener("change", () => {
      const cislo = Math.round(Number(pole.value));
      const min = Number(pole.min);
      const max = Number(pole.max);
      if (!(cislo >= min && cislo <= max)) {
        pole.value = stavPomodora.nastaveni[pole.name]; // nesmysl vrátíme zpět
        return;
      }
      stavPomodora = nactiPomodoro();
      stavPomodora.nastaveni[pole.name] = cislo;
      if (stavPomodora.kolo > stavPomodora.nastaveni.kolDoDlouhe) stavPomodora.kolo = 1;
      ulozPomodoro(stavPomodora);
      obnovSoustredeni();
    });
  }
}

// --- Překreslení (každou sekundu) ---

function obnovSoustredeni() {
  if (zkontrolujKonec(stavPomodora)) oznamKonecFaze(stavPomodora);

  const zbyva = zbyvajiciMs(stavPomodora);
  const celkem = delkaFaze(stavPomodora);
  const cas = formatujCas(zbyva);
  const bezici = bezi(stavPomodora);

  document.getElementById("pomodoro-cas").textContent = cas;
  document.getElementById("pomodoro-faze").textContent = FAZE[stavPomodora.faze];
  document.getElementById("pomodoro-kola").replaceChildren(vytvorKola(stavPomodora));

  // Průběh kruhu: čára se prodlužuje podle uplynulého času
  const prubeh = Math.min(1, Math.max(0, 1 - zbyva / celkem));
  const kruh = document.querySelector(".pomodoro-kruh-prubeh");
  kruh.style.strokeDasharray = OBVOD_KRUHU;
  kruh.style.strokeDashoffset = OBVOD_KRUHU * (1 - prubeh);

  const start = document.getElementById("pomodoro-start");
  start.replaceChildren(vytvorIkonu(bezici ? "pauza" : "spustit"), vytvor("span", "", bezici ? "Pozastavit" : "Spustit"));
  document.getElementById("pomodoro-cifernik").classList.toggle("stoji", !bezici);

  // Zbývající čas i v názvu karty prohlížeče – je vidět z jiné záložky
  document.title = bezici ? `${cas} · ${FAZE[stavPomodora.faze]}` : "Plán · Dashboard";

  vykresliTyden();
}

// Sloupečky za posledních 7 dní (výška = počet pomodor)
function vykresliTyden() {
  const historie = nactiHistorii();
  const dny = [];
  for (let i = 6; i >= 0; i--) {
    const datum = new Date();
    datum.setDate(datum.getDate() - i);
    dny.push({ datum, ...(historie[datumKlic(datum)] || { pocet: 0, minut: 0 }) });
  }
  const nejvic = Math.max(1, ...dny.map((d) => d.pocet));
  const celkem = dny.reduce((soucet, d) => soucet + d.pocet, 0);
  const minut = dny.reduce((soucet, d) => soucet + d.minut, 0);
  const dnes = dny[6];

  document.getElementById("pomodoro-dnes").textContent =
    `Dnes ${textPomodor(dnes.pocet)} (${dnes.minut} min) · za 7 dní ${textPomodor(celkem)} (${(minut / 60).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} h)`;

  const graf = document.getElementById("pomodoro-tyden");
  graf.replaceChildren(
    ...dny.map((d, i) => {
      const sloupec = vytvor("div", "tyden-sloupec");
      if (i === 6) sloupec.classList.add("dnes");
      const pruh = vytvor("div", "tyden-pruh");
      pruh.style.height = (d.pocet / nejvic) * 100 + "%";
      sloupec.title = `${d.datum.toLocaleDateString("cs-CZ")}: ${textPomodor(d.pocet)}`;
      const misto = vytvor("div", "tyden-misto"); // prostor, do kterého pruh roste
      misto.append(pruh);
      sloupec.append(
        vytvor("div", "tyden-pocet", d.pocet || ""),
        misto,
        vytvor("div", "polozka-detail", d.datum.toLocaleDateString("cs-CZ", { weekday: "short" }))
      );
      return sloupec;
    })
  );
}

zobrazSoustredeni();
