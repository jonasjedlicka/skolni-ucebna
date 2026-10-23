// Záložka Škola: přepínač částí (Rozvrh | Testy | Předměty) a dlaždice předmětů.
// Rozvrh a testy vykreslují js/rozvrh.js a js/testy.js do svých částí.

nastavPrepinac(); // přepínač částí je společný pro všechny záložky (spolecne.js)

// Dlaždice všech předmětů (klik → detail s materiály)
async function zobrazPredmety() {
  const mrizka = document.getElementById("predmety");
  try {
    const predmety = await nactiPredmety();
    mrizka.replaceChildren(...Object.values(predmety).map(vytvorDlazdici));
  } catch (chyba) {
    ukazChybu(mrizka, chyba);
  }
}

zobrazPredmety();
