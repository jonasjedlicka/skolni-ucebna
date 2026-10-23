"""
Modul AKCIE: ceny sledovaných a držených akcií a kurzy měn.

Co máš (portfolio) vyplňuješ do ~/Dashboard-data/akcie/portfolio.json.
Skript podle něj stáhne ceny a kurzy do ~/Dashboard-data/akcie/ceny.json;
hodnotu portfolia pak spočítá prohlížeč. Každou hodinu ve všední dny ho
spouští stahovani/vse.py (ten pouští macOS přes launchd).

  .venv/bin/python stahovani/akcie.py      stáhne ceny hned

Ceny: Yahoo Finance (neoficiální rozhraní bez klíče, data se zpožděním).
Kurzy: Česká národní banka.
Tenhle modul data jen zobrazuje – nic nekupuje ani neprodává.
"""

import json
import urllib.request

from umisteni import DATA as DASHBOARD_DATA, uloz_json, zapis_stav  # stahovani/umisteni.py

DATA = DASHBOARD_DATA / "akcie"
PORTFOLIO = DATA / "portfolio.json"

YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/{}?range=1mo&interval=1d"
CNB = "https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt"


def stahni(url):
    # Yahoo odmítá programy bez „jména“ prohlížeče
    pozadavek = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(pozadavek, timeout=20) as odpoved:
        return odpoved.read().decode("utf-8")


def stahni_akcii(symbol):
    vysledek = json.loads(stahni(YAHOO.format(symbol)))["chart"]["result"][0]
    meta = vysledek["meta"]
    # Zavírací ceny za poslední měsíc (dny bez obchodování mají None)
    historie = [round(c, 4) for c in vysledek["indicators"]["quote"][0]["close"] if c is not None]
    cena = meta["regularMarketPrice"]
    # Denní změna = proti předchozímu zavření
    predchozi = historie[-2] if len(historie) >= 2 else None
    return {
        "nazev": meta.get("shortName") or meta.get("longName") or symbol,
        "mena": meta["currency"],
        "cena": cena,
        "zmena_den": round((cena - predchozi) / predchozi * 100, 2) if predchozi else None,
        "historie": historie,
    }


def stahni_kurzy():
    # Formát ČNB:  "22.10.2026 #204", hlavička, pak řádky "EMU|euro|1|EUR|24,265"
    radky = stahni(CNB).strip().splitlines()
    kurzy = {"CZK": 1.0}
    for radek in radky[2:]:
        _, _, mnozstvi, kod, kurz = radek.split("|")
        # Některé měny se uvádějí za 100 kusů (např. jen), proto dělíme množstvím
        kurzy[kod] = float(kurz.replace(",", ".")) / int(mnozstvi)
    return {"datum": radky[0].split(" ")[0], "kurzy": kurzy}


def stahni_ceny():
    portfolio = json.loads(PORTFOLIO.read_text(encoding="utf-8"))
    symboly = list(dict.fromkeys(portfolio["sledovane"] + [d["symbol"] for d in portfolio["drzene"]]))

    # Nevypisujeme symboly ani ceny, jen počty.
    akcie = {}
    chyby = []
    for poradi, symbol in enumerate(symboly, start=1):
        try:
            akcie[symbol] = stahni_akcii(symbol)
        except Exception as chyba:
            # Jedna nefunkční akcie nesmí zastavit ostatní
            print(f"✗ akcie č. {poradi} se nestáhla ({type(chyba).__name__})")
            chyby.append(symbol)
    print(f"✓ Staženo {len(akcie)} z {len(symboly)} akcií")
    if not akcie:
        raise SystemExit("✗ Nepodařilo se stáhnout žádnou cenu, nechávám stará data.")

    kurzy = stahni_kurzy()
    print(f"✓ Kurzy ČNB z {kurzy['datum']}")

    zmena = uloz_json(DATA / "ceny.json", {"akcie": akcie, "kurzy": kurzy})
    zapis_stav("akcie", pocet_chyb=len(chyby))
    print("Uloženo" + ("" if zmena else " (ceny beze změny)"))


if __name__ == "__main__":
    stahni_ceny()
