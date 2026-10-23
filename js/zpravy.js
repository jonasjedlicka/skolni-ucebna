// Stránka Zprávy: všechny zprávy s tlačítky pro výběr zdroje.
// Funkce nactiZpravy a vytvorZpravu jsou v js/moduly/zpravy.js.

let vybranyZdroj = "Vše"; // přežije aktualizaci zpráv

// Načte a vykreslí zprávy. Chybu nechá vyletět – zachytí ji js/obnova.js.
async function vykresliStrankuZprav() {
  zapomenNactene([ZPRAVY_DATA]);
  const zpravy = await nactiZpravy();
  const seznam = document.getElementById("zpravy");
  const filtry = document.getElementById("filtry");
  // new Set(...) nechá každý zdroj jen jednou: ["ČT24", "iRozhlas", "BBC"]
  const zdroje = ["Vše", ...new Set(zpravy.map((z) => z.zdroj))];
  if (!zdroje.includes(vybranyZdroj)) vybranyZdroj = "Vše";

  // Vykreslí seznam jen se zprávami vybraného zdroje
  function ukaz() {
    const vybrane = vybranyZdroj === "Vše" ? zpravy : zpravy.filter((z) => z.zdroj === vybranyZdroj);
    seznam.replaceChildren(...vybrane.map((z) => vytvorZpravu(z, true)));
    for (const tlacitko of filtry.children) {
      tlacitko.classList.toggle("vybrany", tlacitko.textContent === vybranyZdroj);
    }
  }

  filtry.replaceChildren(
    ...zdroje.map((zdroj) => {
      const tlacitko = vytvor("button", "filtr", zdroj);
      tlacitko.type = "button";
      tlacitko.addEventListener("click", () => {
        vybranyZdroj = zdroj; // po kliknutí přefiltruj
        ukaz();
      });
      return tlacitko;
    })
  );
  ukaz();
  return casZeStavu("zpravy");
}

zaregistrujObnovu({
  misto: document.getElementById("obnova-zpravy"),
  kontejner: document.getElementById("zpravy"),
  kazdychMinut: 30,
  maxStariHodin: 8,
  obnov: vykresliStrankuZprav,
});
