"""
Šifrování osobních dat dashboardu.

Na GitHub se nahrávají jen zašifrované soubory (*.enc.json). Rozšifruje je
až prohlížeč, když v něm zadáš heslo (js/spolecne.js dělá totéž obráceně).

Jak to funguje:
  1. Z hesla a „soli“ (náhodná čísla v data/sifra.json) se funkcí PBKDF2
     spočítá klíč. 600 000 opakování dělá hádání hesla schválně pomalým.
  2. Data se zašifrují algoritmem AES-256-GCM. GCM navíc pozná, kdyby
     někdo zašifrovaný soubor změnil – rozšifrování pak selže.

Heslo se bere z Klíčenky macOS (služba „ucebna-sifra“), nebo z proměnné
prostředí UCEBNA_HESLO (tu použije GitHub Actions ze svých Secrets).

Uložení hesla do Klíčenky (zeptá se na heslo, nic se nevypisuje):
  security add-generic-password -a ucebna -s ucebna-sifra -w

Spuštěním  .venv/bin/python stahovani/sifrovani.py  zkontroluješ, že heslo
v Klíčence je, a vytvoří se data/sifra.json a data/kontrola.enc.json.
"""

import base64
import hashlib
import json
import os
import subprocess
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PROJEKT = Path(__file__).resolve().parent.parent
NASTAVENI = PROJEKT / "data" / "sifra.json"  # sůl a počet opakování – veřejné, to nevadí
KONTROLA = PROJEKT / "data" / "kontrola.enc.json"  # podle něj prohlížeč pozná správné heslo
SLUZBA_V_KLICENCE = "ucebna-sifra"
MIN_DELKA_HESLA = 16
ITERACE = 600_000

_klic = None  # klíč spočítáme jen jednou, PBKDF2 je schválně pomalé


def do_base64(bajty):
    return base64.b64encode(bajty).decode("ascii")


def z_base64(text):
    return base64.b64decode(text)


def nacti_heslo():
    heslo = os.environ.get("UCEBNA_HESLO")
    if not heslo:
        vysledek = subprocess.run(
            ["security", "find-generic-password", "-s", SLUZBA_V_KLICENCE, "-w"],
            capture_output=True,
            text=True,
        )
        if vysledek.returncode != 0:
            raise SystemExit(
                "✗ Heslo pro šifrování není v Klíčence. Ulož ho příkazem:\n"
                f"  security add-generic-password -a ucebna -s {SLUZBA_V_KLICENCE} -w"
            )
        heslo = vysledek.stdout.rstrip("\n")
    if len(heslo) < MIN_DELKA_HESLA:
        raise SystemExit(f"✗ Heslo je moc krátké, musí mít aspoň {MIN_DELKA_HESLA} znaků.")
    return heslo


def nacti_nastaveni():
    # Sůl se vytvoří jen jednou. Kdyby se změnila, prohlížeč by spočítal jiný klíč.
    if not NASTAVENI.exists():
        nastaveni = {"sul": do_base64(os.urandom(16)), "iterace": ITERACE}
        NASTAVENI.write_text(json.dumps(nastaveni, indent=2) + "\n", encoding="utf-8")
    return json.loads(NASTAVENI.read_text(encoding="utf-8"))


def klic():
    global _klic
    if _klic is None:
        nastaveni = nacti_nastaveni()
        _klic = hashlib.pbkdf2_hmac(
            "sha256", nacti_heslo().encode("utf-8"), z_base64(nastaveni["sul"]), nastaveni["iterace"], 32
        )
    return _klic


def zasifruj(data):
    iv = os.urandom(12)  # u každého souboru jiné, jinak by šifra byla slabší
    text = json.dumps(data, ensure_ascii=False).encode("utf-8")
    return {"v": 1, "iv": do_base64(iv), "data": do_base64(AESGCM(klic()).encrypt(iv, text, None))}


def desifruj(obal):
    text = AESGCM(klic()).decrypt(z_base64(obal["iv"]), z_base64(obal["data"]), None)
    return json.loads(text.decode("utf-8"))


def uloz_sifrovane(cesta, data):
    """Zašifruje a uloží data. Vrátí True, jen když se obsah opravdu změnil.

    Zašifrovaný soubor vypadá pokaždé jinak (nové náhodné iv), proto
    porovnáváme rozšifrovaný obsah, ne text souboru.
    """
    if cesta.exists():
        try:
            if desifruj(json.loads(cesta.read_text(encoding="utf-8"))) == data:
                return False
        except Exception:
            pass  # starý soubor nejde rozšifrovat (např. jiné heslo) → přepíšeme ho
    cesta.write_text(json.dumps(zasifruj(data), indent=2) + "\n", encoding="utf-8")
    return True


if __name__ == "__main__":
    nacti_heslo()
    nacti_nastaveni()
    uloz_sifrovane(KONTROLA, {"ok": True})
    print("✓ Heslo je v pořádku, šifrování je připravené.")
