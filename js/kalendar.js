// Stránka Kalendář: všechny události na příštích 30 dní, po dnech.
// Funkce nactiUdalosti a vykresliDny jsou v js/moduly/kalendar.js.

async function zobrazStrankuKalendare() {
  const obsah = document.getElementById("kalendar");
  try {
    const udalosti = await nactiUdalosti();
    obsah.replaceChildren();
    vykresliDny(obsah, udalosti);
  } catch (chyba) {
    ukazChybu(obsah, chyba);
  }
}

zobrazStrankuKalendare();
