"""
Záloha dat dashboardu: jednou týdně zabalí ~/Dashboard-data do ZIPu ve složce,
kterou sis vybral (výchozí: iCloud Drive/Dashboard-zalohy). Nechává si
posledních 8 záloh (2 měsíce), starší maže.

Do zálohy NEjdou: uložené přihlášení do Edookitu (po obnově
se jen znovu přihlásíš přes --prihlasit), přihlášená zařízení a logy.

Spouští ho stahovani/vse.py (plánovač) – když je poslední záloha starší než
týden. Když Mac spal nebo byl vypnutý, záloha se udělá po zapnutí.

  .venv/bin/python stahovani/zaloha.py                     zálohovat hned
  .venv/bin/python stahovani/zaloha.py --slozka "/cesta"   jiná složka pro zálohy
  .venv/bin/python stahovani/zaloha.py --obnovit ZIP       obnovit data ze zálohy
"""

import argparse
import json
import shutil
import subprocess
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path

from umisteni import DATA, NASTAVENI, uloz_json, zapis_stav

NASTAVENI_ZALOHY = NASTAVENI / "zaloha.json"
VYCHOZI_SLOZKA = Path.home() / "Library" / "Mobile Documents" / "com~apple~CloudDocs" / "Dashboard-zalohy"
PONECHAT = 8
# Co do zálohy nepatří (cesty uvnitř ~/Dashboard-data)
VYNECHAT_SLOZKY = {".edookit-prihlaseni", "logy", "zalohy-gitu"}
VYNECHAT_SOUBORY = {"nastaveni/relace.json"}


def upozorni(zprava):
    prikaz = f"display notification {json.dumps(zprava, ensure_ascii=False)} with title \"Záloha dashboardu\""
    subprocess.run(["osascript", "-e", prikaz], check=False)


def slozka_zaloh():
    try:
        return Path(json.loads(NASTAVENI_ZALOHY.read_text(encoding="utf-8"))["slozka"]).expanduser()
    except (OSError, ValueError, KeyError):
        return VYCHOZI_SLOZKA


def soubory_k_zaloze():
    for cesta in sorted(DATA.rglob("*")):
        relativni = cesta.relative_to(DATA)
        if not cesta.is_file() or relativni.parts[0] in VYNECHAT_SLOZKY:
            continue
        if relativni.as_posix() in VYNECHAT_SOUBORY or cesta.suffix == ".tmp" or cesta.name == ".DS_Store":
            continue
        yield cesta, relativni


def zalohuj():
    cil = slozka_zaloh()
    if not cil.parent.exists():
        # Např. odpojený externí disk – zkusí se to znovu později (plánovač)
        raise RuntimeError(f"Složka pro zálohy není dostupná: {cil}")
    cil.mkdir(parents=True, exist_ok=True)

    nazev = f"dashboard-{datetime.now():%Y-%m-%d}.zip"
    docasny = cil / (nazev + ".tmp")
    pocet = 0
    with zipfile.ZipFile(docasny, "w", zipfile.ZIP_DEFLATED) as zip_soubor:
        for cesta, relativni in soubory_k_zaloze():
            zip_soubor.write(cesta, relativni.as_posix())
            pocet += 1
    # Kontrola: ZIP jde přečíst a všechny soubory v něm jsou v pořádku
    with zipfile.ZipFile(docasny) as zip_soubor:
        if zip_soubor.testzip() is not None:
            raise RuntimeError("Záloha je poškozená, nechávám starou.")
    docasny.replace(cil / nazev)

    # Necháme posledních PONECHAT záloh, starší smažeme
    zalohy = sorted(cil.glob("dashboard-*.zip"))
    for stara in zalohy[:-PONECHAT]:
        stara.unlink()

    zapis_stav("zaloha", soubor=nazev, pocet_souboru=pocet)
    print(f"✓ Záloha {nazev}: {pocet} souborů → {cil}")
    print(f"  Uchováno záloh: {min(len(zalohy), PONECHAT)}")


def obnov(zip_cesta):
    """Obnoví data ze zálohy. Předtím uloží současná data stranou, kdyby šlo o omyl."""
    zip_cesta = Path(zip_cesta).expanduser()
    with zipfile.ZipFile(zip_cesta) as zip_soubor:
        if zip_soubor.testzip() is not None:
            raise SystemExit("✗ Záloha je poškozená, nic neobnovuji.")
        for nazev in zip_soubor.namelist():
            # Pojistka: soubor ze ZIPu nesmí mířit mimo datovou složku (../…)
            if nazev.startswith("/") or ".." in Path(nazev).parts:
                raise SystemExit(f"✗ Podezřelý soubor v záloze: {nazev}")

        stranou = DATA.parent / f"Dashboard-data-pred-obnovou-{datetime.now():%Y%m%d-%H%M%S}"
        shutil.copytree(DATA, stranou, ignore=shutil.ignore_patterns(*VYNECHAT_SLOZKY))
        print(f"Současná data jsem uložil stranou: {stranou}")

        with tempfile.TemporaryDirectory() as docasna:
            zip_soubor.extractall(docasna)
            shutil.copytree(docasna, DATA, dirs_exist_ok=True)
    print(f"✓ Obnoveno ze zálohy {zip_cesta.name}. Přihlášení do Edookitu zůstalo, jak bylo.")


def main():
    parser = argparse.ArgumentParser(description="Záloha dat dashboardu")
    parser.add_argument("--slozka", help="nastavit složku pro zálohy")
    parser.add_argument("--obnovit", metavar="ZIP", help="obnovit data ze zálohy")
    argumenty = parser.parse_args()

    if argumenty.slozka:
        slozka = Path(argumenty.slozka).expanduser().resolve()
        uloz_json(NASTAVENI_ZALOHY, {"slozka": str(slozka)})
        print(f"✓ Zálohy se budou ukládat do {slozka}")
        return
    if argumenty.obnovit:
        obnov(argumenty.obnovit)
        return
    try:
        zalohuj()
    except Exception as chyba:
        upozorni(f"Záloha se nepovedla: {chyba}")
        raise


if __name__ == "__main__":
    main()
