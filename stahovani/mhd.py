"""
Modul MHD: zašifruje nastavení odjezdů (tvoje zastávky + klíč ke Golemio API).

Odjezdy samotné stahuje až prohlížeč, živě z Golemio API (Pražská otevřená
data). K tomu potřebuje klíč – ten je osobní, takže na GitHub jde jen
zašifrovaný spolu se seznamem zastávek do data/mhd/nastaveni.enc.json.

Jednorázové kroky:
  1. Klíč zdarma: https://api.golemio.cz/api-keys (registrace e-mailem).
  2. Ulož ho do Klíčenky (zeptá se na něj, nic se nevypisuje):
       security add-generic-password -a ucebna -s ucebna-golemio -w
  3. Zastávky napiš do soukrome/mhd/nastaveni.json (vzor vytvoří tenhle skript).
  4. Spusť:
       .venv/bin/python stahovani/mhd.py
     Skript ověří klíč i názvy zastávek u Golemia a uloží zašifrované nastavení.
     Po každé změně zastávek ho spusť znovu.
"""

import json
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import sifrovani  # stahovani/sifrovani.py

PROJEKT = Path(__file__).resolve().parent.parent
NASTAVENI = PROJEKT / "soukrome" / "mhd" / "nastaveni.json"
VYSTUP = PROJEKT / "data" / "mhd" / "nastaveni.enc.json"
SLUZBA_KLICE = "ucebna-golemio"
API = "https://api.golemio.cz/v2/pid/departureboards"

# Vzor nastavení. Vysvětlivky:
#   nazev    – přesný název zastávky jako na jízdním řádu (velká písmena i diakritika)
#   popis    – volitelně tvůj popisek, třeba „do školy“
#   linky    – volitelně jen tyhle linky (prázdné = všechny)
#   nastupiste – volitelně jen tahle nástupiště, např. ["A"] (prázdné = všechna směry)
#   chuze    – kolik minut ti trvá dojít na zastávku; spoje, které nestihneš, se schovají
VZOR = {
    "zastavky": [
        {"nazev": "Malostranská", "popis": "", "linky": [], "nastupiste": [], "chuze": 0},
    ]
}


def nacti_klic():
    vysledek = subprocess.run(
        ["security", "find-generic-password", "-s", SLUZBA_KLICE, "-w"],
        capture_output=True,
        text=True,
    )
    if vysledek.returncode != 0:
        raise SystemExit(
            "✗ Klíč ke Golemio API není v Klíčence. Ulož ho příkazem:\n"
            f"  security add-generic-password -a ucebna -s {SLUZBA_KLICE} -w"
        )
    return vysledek.stdout.strip()


def over_zastavku(klic, nazev):
    """Zeptá se Golemia na odjezdy ze zastávky. Vrátí počet nalezených nástupišť."""
    adresa = API + "?" + urllib.parse.urlencode({"names": nazev, "limit": 1, "minutesAfter": 360})
    pozadavek = urllib.request.Request(adresa, headers={"x-access-token": klic})
    try:
        with urllib.request.urlopen(pozadavek, timeout=20) as odpoved:
            return len(json.load(odpoved).get("stops", []))
    except urllib.error.HTTPError as chyba:
        if chyba.code in (401, 403):
            raise SystemExit("✗ Golemio klíč odmítlo. Zkontroluj, že jsi do Klíčenky uložil celý klíč.")
        if chyba.code == 404:
            return 0
        raise


def main():
    if not NASTAVENI.exists():
        NASTAVENI.parent.mkdir(parents=True, exist_ok=True)
        NASTAVENI.write_text(json.dumps(VZOR, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        raise SystemExit(f"Vytvořil jsem vzor {NASTAVENI.relative_to(PROJEKT)}. Napiš do něj svou zastávku a spusť mě znovu.")

    nastaveni = json.loads(NASTAVENI.read_text(encoding="utf-8"))
    klic = nacti_klic()

    for zastavka in nastaveni["zastavky"]:
        nalezeno = over_zastavku(klic, zastavka["nazev"])
        if nalezeno == 0:
            raise SystemExit(
                f"✗ Zastávku „{zastavka['nazev']}“ Golemio nezná. Název musí přesně odpovídat"
                " jízdnímu řádu (např. „Náměstí Míru“, ne „nám. Míru“)."
            )
        print(f"✓ {zastavka['nazev']}: {nalezeno} nástupišť")

    sifrovani.nacti_heslo()
    sifrovani.nacti_nastaveni()
    VYSTUP.parent.mkdir(parents=True, exist_ok=True)
    zmena = sifrovani.uloz_sifrovane(VYSTUP, {"klic": klic, "zastavky": nastaveni["zastavky"]})
    print("✓ Nastavení MHD zašifrováno." if zmena else "✓ Nastavení MHD se nezměnilo.")


if __name__ == "__main__":
    main()
