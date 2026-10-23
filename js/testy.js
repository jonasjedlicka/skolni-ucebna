// Vykreslí nadcházející testy z data/skola/testy.json do <ul id="testy">.
// Funkce nadchazejiciTesty a vytvorTest jsou v js/moduly/skola.js.

async function zobrazTesty() {
  const seznam = document.getElementById("testy");
  try {
    const [testy, predmety, rozvrh] = await Promise.all([
      nactiSkolniData("testy"),
      nactiPredmety(),
      nactiSkolniData("rozvrh"), // jen kvůli časům hodin
    ]);

    const nadchazejici = nadchazejiciTesty(testy);

    seznam.replaceChildren();
    if (nadchazejici.length === 0) {
      seznam.append(vytvor("li", "slaby", "Žádné nadcházející testy 🎉"));
      return;
    }
    for (const test of nadchazejici) {
      seznam.append(vytvorTest(test, predmety[test.predmet], rozvrh.casy));
    }
  } catch (chyba) {
    ukazChybu(seznam, chyba);
  }
}

zobrazTesty();
