// Přihlašovací stránka: pošle heslo serveru (server/server.py). Když sedí,
// server uloží do prohlížeče přihlašovací cookie a vrátíme se, kam jsi chtěl.

const formular = document.getElementById("prihlaseni");
const chyba = document.getElementById("chyba");

// Kam po přihlášení – jen stránka tohoto webu (ne cizí adresa podstrčená v odkazu)
function kamDal() {
  const dalsi = new URLSearchParams(location.search).get("dalsi") || "/";
  return dalsi.startsWith("/") && !dalsi.startsWith("//") ? dalsi : "/";
}

formular.addEventListener("submit", async (udalost) => {
  udalost.preventDefault();
  const tlacitko = formular.querySelector("button");
  tlacitko.disabled = true;
  chyba.textContent = "";
  try {
    const odpoved = await fetch("/api/prihlaseni", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ heslo: formular.heslo.value }),
    });
    if (odpoved.ok) {
      location.replace(kamDal());
      return;
    }
    chyba.textContent = (await odpoved.json()).chyba || "Přihlášení se nepovedlo.";
    formular.heslo.select();
  } catch {
    chyba.textContent = "Nejde se spojit s Macem. Běží a jsi připojený přes Tailscale?";
  } finally {
    tlacitko.disabled = false;
  }
});
