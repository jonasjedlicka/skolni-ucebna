// Stránka Akcie: podrobnosti o každé držené akcii a seznam sledovaných.
// Výpočty a vykreslování řádků jsou v js/moduly/akcie.js.

async function zobrazStrankuAkcii() {
  const obsah = document.getElementById("akcie");
  try {
    const data = await nactiAkcie();
    const { pozice, celkem } = spocitejPortfolio(data);
    obsah.replaceChildren(vytvorSouhrn(celkem));

    obsah.append(vytvor("h2", "", "Portfolio"));
    const drzene = vytvor("ul", "seznam");
    for (const p of pozice) {
      // Např. „2 ks · nákup 150,00 € · hodnota 7 340 Kč · zisk +460 Kč (+6,7 %)“
      const podrobnosti = p.akcie
        ? `${p.kusu} ks · nákup ${vMene(p.nakupni_cena, p.akcie.mena)} · hodnota ${korun(p.hodnota)} · ` +
          `zisk ${korun(p.zisk)} (${procenta(p.ziskProcent)})`
        : `${p.kusu} ks`;
      drzene.append(vytvorAkcii(p.symbol, p.akcie, podrobnosti));
    }
    obsah.append(drzene);

    obsah.append(vytvor("h2", "", "Sledované"));
    const sledovane = vytvor("ul", "seznam");
    for (const symbol of data.portfolio.sledovane) {
      sledovane.append(vytvorAkcii(symbol, data.ceny.akcie[symbol]));
    }
    obsah.append(sledovane);

    const kurzy = data.ceny.kurzy;
    obsah.append(vytvor("p", "slaby", `Kurzy ČNB z ${kurzy.datum}. Ceny z Yahoo Finance se zpožděním.`));
  } catch (chyba) {
    ukazChybu(obsah, chyba);
  }
}

zobrazStrankuAkcii();
