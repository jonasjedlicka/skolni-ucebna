"""
Plánovač stahování: macOS ho spouští každých 30 minut (launchd, viz
launchd/cz.dashboard.stahovani.plist) a on sám pozná, co je na řadě.

Když Mac spal nebo byl vypnutý, po probuzení se zmeškané stažení dožene –
rozhoduje se podle toho, jak stará jsou data, ne podle hodin.

  .venv/bin/python stahovani/vse.py            stáhne, co je na řadě
  .venv/bin/python stahovani/vse.py --vse      stáhne všechno hned

Záznam běhů: ~/Dashboard-data/logy/stahovani.log
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

from umisteni import DATA, LOGY, uloz_json

SLOZKA = Path(__file__).resolve().parent
POKUSY = LOGY / "posledni-pokusy.json"  # kdy jsme co naposledy zkoušeli (i neúspěšně)
LOG = LOGY / "stahovani.log"
MAX_LOG = 1_000_000  # větší log se zkrátí, ať neroste donekonečna

# Co stahovat a jak často. „po_chybe“ = za jak dlouho to zkusit znovu, když se to nepovedlo.
ULOHY = [
    {"nazev": "zpravy", "skript": "zpravy.py", "kazdych": timedelta(hours=3), "po_chybe": timedelta(minutes=30)},
    {"nazev": "kalendar", "skript": "kalendar.py", "kazdych": timedelta(hours=2), "po_chybe": timedelta(minutes=30)},
    # Ceny se o víkendu nemění (burzy jsou zavřené) – stahujeme jen ve všední dny
    {"nazev": "akcie", "skript": "akcie.py", "kazdych": timedelta(hours=1), "po_chybe": timedelta(minutes=30), "jen_vsedni": True},
    # Edookit jednou denně, nejdřív v 6:00 (rozvrh na ten den už je známý)
    {"nazev": "skola", "skript": "stahni.py", "kazdych": timedelta(hours=20), "po_chybe": timedelta(hours=2), "od_hodiny": 6},
]


def posledni_uspech(nazev):
    try:
        stav = json.loads((DATA / nazev / "stav.json").read_text(encoding="utf-8"))
        return datetime.fromisoformat(stav["aktualizovano"]).astimezone().replace(tzinfo=None)
    except (OSError, KeyError, ValueError):
        return datetime.min  # ještě nikdy


def je_na_rade(uloha, pokusy, ted):
    if uloha.get("jen_vsedni") and ted.weekday() >= 5:
        return False
    if ted.hour < uloha.get("od_hodiny", 0):
        return False
    if ted - posledni_uspech(uloha["nazev"]) < uloha["kazdych"]:
        return False  # data jsou dost čerstvá
    posledni_pokus = datetime.fromisoformat(pokusy.get(uloha["nazev"], "2000-01-01T00:00"))
    return ted - posledni_pokus >= uloha["po_chybe"]  # po nezdaru chvíli počkáme


def spust(uloha):
    print(f"--- {uloha['nazev']} ({datetime.now():%-d. %-m. %H:%M})", flush=True)
    try:
        # Každá úloha běží zvlášť: když jedna spadne nebo se zasekne, ostatní pokračují
        vysledek = subprocess.run([sys.executable, str(SLOZKA / uloha["skript"])], cwd=SLOZKA.parent, timeout=600)
        return vysledek.returncode == 0
    except subprocess.TimeoutExpired:
        print("✗ trvalo moc dlouho, ukončeno", flush=True)
        return False


def main():
    parser = argparse.ArgumentParser(description="Stáhne, co je na řadě.")
    parser.add_argument("--vse", action="store_true", help="stáhnout všechno hned")
    vse = parser.parse_args().vse

    LOGY.mkdir(parents=True, exist_ok=True)
    if LOG.exists() and LOG.stat().st_size > MAX_LOG:
        LOG.write_text(LOG.read_text(encoding="utf-8")[-MAX_LOG // 2 :], encoding="utf-8")

    try:
        pokusy = json.loads(POKUSY.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pokusy = {}

    ted = datetime.now()
    for uloha in ULOHY:
        if vse or je_na_rade(uloha, pokusy, ted):
            pokusy[uloha["nazev"]] = datetime.now().isoformat(timespec="seconds")
            uloz_json(POKUSY, pokusy)
            spust(uloha)


if __name__ == "__main__":
    main()
