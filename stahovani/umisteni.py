"""
Kde dashboard ukládá osobní data: ve složce MIMO repozitář, aby se nikdy
nedostala na GitHub. Výchozí je ~/Dashboard-data, jinou složku nastavíš
proměnnou prostředí DASHBOARD_DATA.

  ~/Dashboard-data/
    skola/      rozvrh, testy, předměty (z Edookitu)
    zpravy/     zprávy z RSS
    akcie/      portfolio.json (vyplňuješ ty) a ceny
    kalendar/   události z Google Kalendáře
    zapisy/     co zapíšeš v dashboardu (úkoly, poznámky, známky, trénink…)
    nastaveni/  heslo do dashboardu (jen otisk), přihlášení, adresy kalendářů
    logy/       záznamy automatických běhů
    .edookit-prihlaseni/  uložené přihlášení do Edookitu
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

DATA = Path(os.environ.get("DASHBOARD_DATA") or Path.home() / "Dashboard-data")
NASTAVENI = DATA / "nastaveni"
LOGY = DATA / "logy"


def uloz_json(cesta, data):
    """Uloží JSON (atomicky: nejdřív do dočasného souboru, pak přejmenuje,
    takže soubor nikdy nezůstane napůl zapsaný). Vrátí True, jen když se
    obsah opravdu změnil."""
    cesta = Path(cesta)
    cesta.parent.mkdir(parents=True, exist_ok=True)
    novy = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if cesta.exists() and cesta.read_text(encoding="utf-8") == novy:
        return False
    docasny = cesta.with_suffix(cesta.suffix + ".tmp")
    docasny.write_text(novy, encoding="utf-8")
    os.replace(docasny, cesta)
    return True


def zapis_stav(slozka, **navic):
    """data/<slozka>/stav.json – kdy se naposledy úspěšně stahovalo.
    Dashboard podle něj ukazuje „aktualizováno před…“."""
    uloz_json(DATA / slozka / "stav.json", {"aktualizovano": datetime.now(timezone.utc).isoformat(timespec="seconds"), **navic})
