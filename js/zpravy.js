// Stránka Zprávy: všechny zprávy s tlačítky pro výběr zdroje.
// Funkce nactiZpravy a vytvorZpravu jsou v js/moduly/zpravy.js.

async function zobrazStrankuZprav() {
  const seznam = document.getElementById("zpravy");
  const filtry = document.getElementById("filtry");
  try {
    const zpravy = await nactiZpravy();
    // new Set(...) nechá každý zdroj jen jednou: ["ČT24", "iRozhlas", "BBC"]
    const zdroje = ["Vše", ...new Set(zpravy.map((z) => z.zdroj))];

    // Vykreslí seznam jen se zprávami vybraného zdroje
    function ukaz(vybrany) {
      const vybrane = vybrany === "Vše" ? zpravy : zpravy.filter((z) => z.zdroj === vybrany);
      seznam.replaceChildren(...vybrane.map((z) => vytvorZpravu(z, true)));
      for (const tlacitko of filtry.children) {
        tlacitko.classList.toggle("vybrany", tlacitko.textContent === vybrany);
      }
    }

    for (const zdroj of zdroje) {
      const tlacitko = vytvor("button", "filtr", zdroj);
      tlacitko.type = "button";
      tlacitko.addEventListener("click", () => ukaz(zdroj)); // po kliknutí přefiltruj
      filtry.append(tlacitko);
    }
    ukaz("Vše");
  } catch (chyba) {
    ukazChybu(seznam, chyba);
  }
}

zobrazStrankuZprav();
