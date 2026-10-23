// Záložka Škola: přepínač částí (Rozvrh | Testy | Předměty) a dlaždice předmětů.
// Rozvrh a testy vykreslují js/rozvrh.js a js/testy.js do svých částí.

const CASTI = ["rozvrh", "testy", "predmety"];

// Ukáže vybranou část a schová ostatní. Část je i v adrese (skola.html#testy),
// takže funguje tlačítko Zpět i odkaz z Přehledu rovnou na testy.
// animovat = false při načtení stránky: tam už běží animace přechodu mezi
// záložkami a druhou animaci by prohlížeč i se změnou zahodil.
function ukazCast(cast, animovat = true) {
  if (!CASTI.includes(cast)) cast = CASTI[0];
  const prepni = () => {
    for (const nazev of CASTI) {
      document.getElementById("cast-" + nazev).hidden = nazev !== cast;
    }
    for (const tlacitko of document.querySelectorAll(".prepinac button")) {
      tlacitko.setAttribute("aria-selected", tlacitko.dataset.cast === cast);
    }
  };
  // View Transitions: prohlížeč plynule prolne starý a nový obsah.
  // Kde ji prohlížeč neumí, část se přepne hned (bez animace).
  if (animovat && document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.startViewTransition(prepni);
  } else {
    prepni();
  }
}

for (const tlacitko of document.querySelectorAll(".prepinac button")) {
  tlacitko.addEventListener("click", () => {
    history.replaceState(null, "", "#" + tlacitko.dataset.cast); // zapíše část do adresy
    ukazCast(tlacitko.dataset.cast);
  });
}
window.addEventListener("hashchange", () => ukazCast(location.hash.slice(1)));
ukazCast(location.hash.slice(1), false);

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
