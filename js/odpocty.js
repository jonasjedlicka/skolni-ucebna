// Část Odpočty v záložce Plán: nejbližší událost velká, pod ní všechny
// další (i s testy), formulář na vlastní odpočet a obnovení skrytých.
// Výpočty a pevné termíny jsou v js/moduly/odpocty.js.

let testyOdpoctu = []; // testy se načtou zvlášť, protože potřebují heslo

async function zobrazOdpocty() {
  document.getElementById("odpocty-hlavni").before(vytvorStavZapisu(odpoctyZapisy()));
  nastavFormularOdpoctu();
  vykresliOdpocty();
  try {
    testyOdpoctu = await testyJakoOdpocty();
    vykresliOdpocty();
  } catch {
    // Bez hesla (nebo bez dat) ukážeme odpočty bez testů
    document.getElementById("odpocty-testy").textContent = "Testy se nepodařilo načíst – odemkni data heslem.";
  }
}

function vykresliOdpocty() {
  const odpocty = seradOdpocty([...zakladniOdpocty(), ...testyOdpoctu]);
  const hlavni = document.getElementById("odpocty-hlavni");
  const seznam = document.getElementById("odpocty-seznam");

  if (odpocty.length === 0) {
    hlavni.replaceChildren(vytvor("p", "slaby", "Žádné nadcházející odpočty. Přidej si vlastní níž."));
    seznam.replaceChildren();
  } else {
    const [prvni, ...dalsi] = odpocty;
    hlavni.replaceChildren(vytvorHlavniOdpocet(prvni));
    if (prvni.poznamka) hlavni.append(vytvor("p", "polozka-detail", prvni.poznamka));
    hlavni.append(vytvorTlacitkoOdebrat(prvni));
    seznam.replaceChildren(
      ...dalsi.map((u) => {
        const radek = vytvorRadekOdpoctu(u);
        radek.append(vytvorTlacitkoOdebrat(u));
        return radek;
      })
    );
  }
  vykresliSkryte();
}

// Vlastní odpočet jde smazat, pevný termín skrýt. Testy jsou z Edookitu – ty ne.
function vytvorTlacitkoOdebrat(u) {
  if (u.typ === "Test") return document.createTextNode("");
  const tlacitko = vytvor("button", "odebrat-tlacitko", "×");
  tlacitko.type = "button";
  tlacitko.setAttribute("aria-label", (u.vlastni ? "Smazat " : "Skrýt ") + u.nazev);
  tlacitko.title = u.vlastni ? "Smazat" : "Skrýt";
  tlacitko.addEventListener("click", () => {
    if (u.vlastni) {
      if (confirm(`Smazat odpočet „${u.nazev}“?`)) odpoctyZapisy().smaz(u.id);
    } else {
      skryjOdpocet(u.id);
    }
  });
  return tlacitko;
}

// Odkaz „Obnovit skryté (2)“ – vrátí všechny skryté pevné termíny
function vykresliSkryte() {
  const misto = document.getElementById("odpocty-skryte");
  const ulozene = nactiUlozeneOdpocty();
  misto.replaceChildren();
  if (ulozene.skryte.length === 0) return;
  const tlacitko = vytvor("button", "odkaz-tlacitko", `Obnovit skryté termíny (${ulozene.skryte.length})`);
  tlacitko.type = "button";
  tlacitko.addEventListener("click", obnovSkryteOdpocty);
  misto.append(tlacitko);
}

function nastavFormularOdpoctu() {
  const formular = document.getElementById("odpocty-formular");
  formular.addEventListener("submit", (udalost) => {
    udalost.preventDefault(); // formulář nikam neodesíláme, zpracujeme ho tady
    const data = new FormData(formular);
    const nazev = data.get("nazev").trim();
    const od = data.get("od");
    const doKdy = data.get("do");
    if (!nazev || !od) return;
    if (doKdy && doKdy < od) {
      alert("Konec nemůže být dřív než začátek.");
      return;
    }
    pridejOdpocet(nazev, od, doKdy);
    formular.reset();
  });
}

// O půlnoci se počty dní změní – stránka otevřená přes noc se sama obnoví
setInterval(vykresliOdpocty, 10 * 60 * 1000);

// Změna (i z jiného zařízení nebo karty) → překreslit
odpoctyZapisy().naZmenu(vykresliOdpocty);

zobrazOdpocty();
