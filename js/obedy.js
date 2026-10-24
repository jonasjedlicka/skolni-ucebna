// Část Obědy v záložce Škola: upozornění, jídelníček s objednanými jídly,
// nutričním skóre a tím, co by skript vybral, a seznam oblíbených
// a neoblíbených jídel. Data a výpočty jsou v js/moduly/obedy.js.

async function zobrazObedy() {
  const misto = document.getElementById("obedy");
  if (!misto) return;
  const upozorneni = vytvor("div", "");
  upozorneni.id = "obedy-upozorneni";
  const jidelnicek = vytvor("div", "");
  jidelnicek.id = "obedy-jidelnicek";
  const posledni = vytvor("p", "polozka-detail");
  posledni.id = "obedy-posledni";
  misto.replaceChildren(upozorneni, jidelnicek, posledni, vytvorPreferenceObedu());

  obedyZapisy().naZmenu(vykresliJidelnicek); // jiná přání → jiný „vybral by“
  zaregistrujObnovu({
    misto: document.getElementById("obnova-obedy"),
    kontejner: jidelnicek,
    kazdychMinut: 60,
    maxStariHodin: 24,
    obnov: async () => {
      zapomenNactene([OBEDY_DATA]);
      const [dny, objednavka] = await Promise.all([nactiJidelnicek(), nactiObjednavku()]);
      dnyObedu = dny;
      vykresliUpozorneni(objednavka);
      vykresliJidelnicek();
      return casZeStavu("obedy");
    },
  });
}

let dnyObedu = [];

function vykresliUpozorneni(objednavka) {
  const misto = document.getElementById("obedy-upozorneni");
  misto.replaceChildren(...upozorneniObedu(objednavka).map((text) => vytvor("p", "pocasi-varovani obed-varovani", text)));
  const posledni = document.getElementById("obedy-posledni");
  posledni.textContent = objednavka?.cas
    ? `Naposledy objednáváno ${new Date(objednavka.cas).toLocaleString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", hour: "numeric", minute: "2-digit" })} (týden od ${parsujDatum(objednavka.tyden).toLocaleDateString("cs-CZ")}).`
    : "Objednávání zatím neproběhlo – poprvé v pátek v 8:00.";
}

function vykresliJidelnicek() {
  const misto = document.getElementById("obedy-jidelnicek");
  const dnes = datumKlic();
  const preference = preferenceObedu();
  const dny = dnyObedu.filter((d) => d.datum >= dnes && d.jidla.length);
  if (dny.length === 0) {
    misto.replaceChildren(vytvor("p", "slaby", "Na nejbližší dny jídelníček není (nevaří se, nebo ještě není zveřejněný)."));
    return;
  }
  misto.replaceChildren(
    ...dny.map((den) => {
      const sekce = vytvor("section", "sekce");
      const nazev = parsujDatum(den.datum).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" });
      sekce.append(vytvor("h2", "", nazev[0].toUpperCase() + nazev.slice(1)));
      const vybral = vybraneMenu(den, preference);
      const ul = vytvor("ul", "seznam");
      for (const jidlo of den.jidla) {
        const li = vytvor("li", "polozka obed");
        if (!jidlo.objednano) li.classList.add("neobjednano");
        const hlavni = vytvor("div", "polozka-hlavni");
        hlavni.append(vytvor("div", "polozka-nazev", jidlo.nazev));
        const detail = [jidlo.druh];
        // Polévka a zákusek jsou zamčené vždy (jdou s obědem) – „po uzávěrce“ jen u menu
        if (jidlo.zamceno && /^menu/i.test(jidlo.druh)) detail.push("po uzávěrce");
        if (jidlo.nutri) detail.push(textNutri(jidlo));
        if (jidlo === vybral && !jidlo.objednano) detail.push("vybralo by se tohle – nutričně lepší");
        hlavni.append(vytvor("div", "polozka-detail", detail.join(" · ")));
        li.append(hlavni);
        if (jidlo.objednano) li.append(vytvor("span", "stitek brzy", "objednáno"));
        ul.append(li);
      }
      sekce.append(ul);
      return sekce;
    })
  );
}

// Oblíbená a neoblíbená jídla: kousky slov (stačí „kuřec“, „řízek“, „ryb“)
function vytvorPreferenceObedu() {
  const karta = vytvor("div", "karta sekce obedy-preference");
  karta.append(vytvor("h2", "", "Co mám rád a co ne"));
  karta.append(vytvor("p", "polozka-detail", "Skript v pátek vybere nutričně lepší menu (skóre vidíš u jídel). Neoblíbené nevybere nikdy, oblíbené rozhodne jen při stejném skóre. Stačí kus slova – „kuřec“ najde kuřecí i kuře, háčky nevadí."));
  for (const [druh, popis] of [["oblibene", "Oblíbená"], ["neoblibene", "Neoblíbená"]]) {
    const blok = vytvor("div", "obedy-skupina");
    blok.append(vytvor("div", "polozka-nazev", popis));
    const stitky = vytvor("div", "filtry");
    const formular = vytvor("form", "cil-novy-krok");
    const pole = vytvor("input", "");
    pole.placeholder = druh === "oblibene" ? "Např. řízek" : "Např. ryb";
    pole.maxLength = 30;
    pole.setAttribute("aria-label", `${popis} jídlo`);
    const pridat = vytvor("button", "kulate-tlacitko maly", "+");
    pridat.type = "submit";
    pridat.setAttribute("aria-label", `Přidat ${popis.toLowerCase()} jídlo`);
    formular.append(pole, pridat);
    formular.addEventListener("submit", (udalost) => {
      udalost.preventDefault();
      const slovo = pole.value.trim();
      if (slovo) obedyZapisy().uloz({ druh, slovo });
      pole.value = "";
    });
    const prekresli = () => {
      stitky.replaceChildren(
        ...obedyZapisy()
          .polozky()
          .filter((p) => p.druh === druh)
          .map((p) => {
            const stitek = vytvor("button", "filtr", `${p.slovo} ×`);
            stitek.type = "button";
            stitek.setAttribute("aria-label", `Odebrat ${p.slovo}`);
            stitek.addEventListener("click", () => obedyZapisy().smaz(p.id));
            return stitek;
          })
      );
    };
    obedyZapisy().naZmenu(prekresli);
    prekresli();
    blok.append(stitky, formular);
    karta.append(blok);
  }
  karta.append(vytvorStavZapisu(obedyZapisy()));
  return karta;
}

zobrazObedy();
