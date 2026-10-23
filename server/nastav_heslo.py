"""
Nastaví (nebo změní) heslo do dashboardu. Může to být i PIN, aspoň 6 znaků.

  .venv/bin/python server/nastav_heslo.py

Heslo se při psaní nezobrazuje. Uloží se jen jeho otisk (PBKDF2-SHA256)
do ~/Dashboard-data/nastaveni/prihlaseni.json – samotné heslo nikde.
Po změně hesla se všechna zařízení odhlásí.
"""

import getpass
import hashlib
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "stahovani"))
from umisteni import NASTAVENI, uloz_json  # noqa: E402

MIN_DELKA = 6
ITERACE = 600_000  # schválně pomalé – hádání hesla je pak k ničemu


def main():
    heslo = getpass.getpass("Nové heslo nebo PIN (aspoň 6 znaků): ")
    if len(heslo) < MIN_DELKA:
        raise SystemExit(f"✗ Moc krátké, musí mít aspoň {MIN_DELKA} znaků.")
    if getpass.getpass("Zopakuj ho: ") != heslo:
        raise SystemExit("✗ Hesla se neshodují, nic jsem neuložil.")

    sul = secrets.token_bytes(16)
    otisk = hashlib.pbkdf2_hmac("sha256", heslo.encode(), sul, ITERACE)
    uloz_json(NASTAVENI / "prihlaseni.json", {"sul": sul.hex(), "iterace": ITERACE, "otisk": otisk.hex()})
    uloz_json(NASTAVENI / "relace.json", {})  # odhlásit všechna zařízení
    print("✓ Heslo uloženo. Všechna zařízení se musí přihlásit znovu.")


if __name__ == "__main__":
    main()
