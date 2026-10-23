"""
Modul AKCIE: ceny sledovaných a držených akcií a kurzy měn.

Dva režimy:

  .venv/bin/python stahovani/akcie.py --ulozit-portfolio
      Na Macu: zašifruje tvoje portfolio ze soukrome/akcie/portfolio.json
      do data/akcie/portfolio.enc.json. Spusť po každé úpravě portfolia.

  python3 stahovani/akcie.py
      V cloudu (GitHub Actions): rozšifruje portfolio, aby věděl, které
      akcie stáhnout, stáhne ceny a kurzy a uloží je zašifrované do
      data/akcie/ceny.enc.json. Hodnotu portfolia pak spočítá prohlížeč.

Ceny: Yahoo Finance (neoficiální rozhraní bez klíče, data se zpožděním).
Kurzy: Česká národní banka.
Tenhle modul data jen zobrazuje – nic nekupuje ani neprodává.
"""

import argparse
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import sifrovani  # stahovani/sifrovani.py

PROJEKT = Path(__file__).resolve().parent.parent
DATA = PROJEKT / "data" / "akcie"
PORTFOLIO = PROJEKT / "soukrome" / "akcie" / "portfolio.json"

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


def uloz_portfolio():
    portfolio = json.loads(PORTFOLIO.read_text(encoding="utf-8"))
    portfolio.pop("_navod", None)
    for drzena in portfolio["drzene"]:
        if not {"symbol", "kusu", "nakupni_cena"} <= drzena.keys():
            raise SystemExit(f"✗ U {drzena} chybí symbol, kusu nebo nakupni_cena.")
    DATA.mkdir(parents=True, exist_ok=True)
    zmena = sifrovani.uloz_sifrovane(DATA / "portfolio.enc.json", portfolio)
    print("✓ Portfolio zašifrováno" + ("" if zmena else " (beze změny)"))
    print("  Nahraj ho:  git add data/akcie/portfolio.enc.json && git commit -m Portfolio && git push")


def stahni_ceny():
    portfolio = sifrovani.desifruj(json.loads((DATA / "portfolio.enc.json").read_text(encoding="utf-8")))
    symboly = list(dict.fromkeys(portfolio["sledovane"] + [d["symbol"] for d in portfolio["drzene"]]))

    # POZOR: výpisy běhů GitHub Actions jsou u veřejného repozitáře veřejné.
    # Proto nikdy nevypisujeme symboly ani ceny, jen počty.
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

    zmena = sifrovani.uloz_sifrovane(DATA / "ceny.enc.json", {"akcie": akcie, "kurzy": kurzy})
    (DATA / "stav.json").write_text(
        json.dumps(
            {"aktualizovano": datetime.now(timezone.utc).isoformat(timespec="seconds"), "pocet_chyb": len(chyby)},
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    # Které akcie selhaly, schválně nepíšeme do stav.json ani do výpisu –
    # obojí je veřejné a prozradilo by, co sleduješ. Na webu u nich chybí cena.
    print("Uloženo" + ("" if zmena else " (ceny beze změny)"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ceny akcií pro dashboard.")
    parser.add_argument("--ulozit-portfolio", action="store_true", help="zašifrovat soukrome/akcie/portfolio.json")
    if parser.parse_args().ulozit_portfolio:
        uloz_portfolio()
    else:
        stahni_ceny()
