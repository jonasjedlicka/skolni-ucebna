"""
Stáhne zprávy z RSS kanálů a uloží je do data/zpravy/zpravy.json.

Seznam kanálů je v stahovani/zpravy-zdroje.json – přidat nebo odebrat
zdroj znamená upravit jen ten soubor.

Spouští ho GitHub Actions každé 3 hodiny (.github/workflows/zpravy.yml).
Vyzkoušet ho můžeš i u sebe:  python3 stahovani/zpravy.py

Používá jen standardní knihovnu Pythonu, takže nic nemusíš instalovat.
"""

import html
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

PROJEKT = Path(__file__).resolve().parent.parent
ZDROJE = Path(__file__).parent / "zpravy-zdroje.json"
DATA = PROJEKT / "data" / "zpravy"

POCET_ZA_ZDROJ = 15  # kolik nejnovějších zpráv z každého zdroje uložit
DELKA_PEREXU = 220  # kolik znaků úvodního textu ponechat
ATOM = "{http://www.w3.org/2005/Atom}"  # Atom je druhý častý formát kanálů


def stahni(url):
    # Některé servery odmítají programy bez „jména“, tak se představíme
    pozadavek = urllib.request.Request(url, headers={"User-Agent": "Ucebna-dashboard/1.0"})
    with urllib.request.urlopen(pozadavek, timeout=20) as odpoved:
        return odpoved.read()


def cisty_text(text):
    # V RSS bývá HTML (<p>, &nbsp; …). Na webu ale vkládáme jen čistý text,
    # takže značky odstraníme a entity převedeme na znaky.
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > DELKA_PEREXU:
        text = text[:DELKA_PEREXU].rsplit(" ", 1)[0] + "…"
    return text


def precti_cas(text):
    # RSS píše čas jako "Fri, 23 Oct 2026 09:12:00 +0200", Atom jako "2026-10-23T09:12:00Z"
    if not text:
        return None
    try:
        cas = parsedate_to_datetime(text)
    except (TypeError, ValueError):
        try:
            cas = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
    if cas.tzinfo is None:
        cas = cas.replace(tzinfo=timezone.utc)
    return cas.astimezone(timezone.utc)


def precti_kanal(obsah, nazev_zdroje):
    koren = ET.fromstring(obsah)
    zpravy = []

    for polozka in koren.iter("item"):  # RSS 2.0
        zpravy.append({
            "titulek": cisty_text(polozka.findtext("title")),
            "odkaz": (polozka.findtext("link") or "").strip(),
            "cas": precti_cas(polozka.findtext("pubDate")),
            "perex": cisty_text(polozka.findtext("description")),
        })

    for polozka in koren.iter(ATOM + "entry"):  # Atom
        odkaz = polozka.find(ATOM + "link")
        zpravy.append({
            "titulek": cisty_text(polozka.findtext(ATOM + "title")),
            "odkaz": odkaz.get("href", "") if odkaz is not None else "",
            "cas": precti_cas(polozka.findtext(ATOM + "updated") or polozka.findtext(ATOM + "published")),
            "perex": cisty_text(polozka.findtext(ATOM + "summary")),
        })

    # Necháme jen zprávy s titulkem, webovým odkazem a časem
    return [
        {**z, "zdroj": nazev_zdroje}
        for z in zpravy
        if z["titulek"] and z["odkaz"].startswith(("http://", "https://")) and z["cas"]
    ]


def uloz(nazev, data):
    """Uloží JSON. Vrátí True, jen když se obsah opravdu změnil."""
    cesta = DATA / nazev
    novy_text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if cesta.exists() and cesta.read_text(encoding="utf-8") == novy_text:
        return False
    cesta.write_text(novy_text, encoding="utf-8")
    return True


def main():
    zdroje = json.loads(ZDROJE.read_text(encoding="utf-8"))
    vsechny = []
    chyby = []

    for zdroj in zdroje:
        try:
            zpravy = precti_kanal(stahni(zdroj["url"]), zdroj["nazev"])
            print(f"✓ {zdroj['nazev']}: {len(zpravy)} zpráv")
            # Každý zdroj dostane stejný prostor, i když některý píše častěji
            zpravy.sort(key=lambda z: z["cas"], reverse=True)
            vsechny.extend(zpravy[:POCET_ZA_ZDROJ])
        except Exception as chyba:
            # Jeden nefunkční zdroj nesmí zastavit ostatní
            print(f"✗ {zdroj['nazev']}: {chyba}")
            chyby.append(zdroj["nazev"])

    if not vsechny:
        raise SystemExit("✗ Nepodařilo se stáhnout žádné zprávy, nechávám ta stará data.")

    # Stejná zpráva může přijít dvakrát (např. ve dvou rubrikách) – necháme jednu
    podle_odkazu = {z["odkaz"]: z for z in vsechny}
    nejnovejsi = sorted(podle_odkazu.values(), key=lambda z: z["cas"], reverse=True)
    for zprava in nejnovejsi:
        zprava["cas"] = zprava["cas"].isoformat(timespec="seconds")

    DATA.mkdir(parents=True, exist_ok=True)
    zmena = uloz("zpravy.json", nejnovejsi)
    uloz("stav.json", {
        "aktualizovano": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "nefunkcni_zdroje": chyby,
    })
    print(f"Uloženo {len(nejnovejsi)} zpráv" + ("" if zmena else " (beze změny)"))


if __name__ == "__main__":
    main()
