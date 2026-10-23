"""
Modul KALENDÁŘ: události z Google Kalendáře na příštích 30 dní.

Kalendář se stahuje přes „tajnou adresu ve formátu iCal“ (Google Kalendář →
Nastavení → tvůj kalendář → Integrace kalendáře). Kdo tu adresu zná, vidí
celý kalendář, proto je jen v ~/Dashboard-data/nastaveni/kalendar-adresy.txt
(mimo repozitář).

Do souboru můžeš dát víc kalendářů, každý na nový řádek:
    Osobní=https://calendar.google.com/calendar/ical/.../basic.ics
    Škola=https://calendar.google.com/calendar/ical/.../basic.ics
(Název před „=“ se ukáže u události. Bez názvu stačí jen adresa.)

Každé 2 hodiny ho spouští stahovani/vse.py (ten pouští macOS přes launchd).
Události se ukládají do ~/Dashboard-data/kalendar/udalosti.json.
"""

import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import icalendar
import recurring_ical_events

from umisteni import DATA as DASHBOARD_DATA, NASTAVENI, uloz_json, zapis_stav  # stahovani/umisteni.py

DATA = DASHBOARD_DATA / "kalendar"
ADRESY = NASTAVENI / "kalendar-adresy.txt"
PRAHA = ZoneInfo("Europe/Prague")
DNI_DOPREDU = 30


def nacti_kalendare():
    text = ADRESY.read_text(encoding="utf-8") if ADRESY.exists() else ""
    if not text.strip():
        raise SystemExit(f"✗ Chybí adresa kalendáře – vlož ji do {ADRESY}.")

    kalendare = []
    for radek in text.splitlines():
        radek = radek.strip()
        if not radek or radek.startswith("#"):
            continue
        if radek.startswith(("http://", "https://")):
            kalendare.append(("Kalendář", radek))
        else:
            nazev, adresa = radek.split("=", 1)
            kalendare.append((nazev.strip(), adresa.strip()))
    return kalendare


def stahni(adresa):
    pozadavek = urllib.request.Request(adresa, headers={"User-Agent": "Ucebna-dashboard/1.0"})
    with urllib.request.urlopen(pozadavek, timeout=30) as odpoved:
        return odpoved.read()


def na_text(hodnota):
    """Čas události jako text pro web. Vrátí (text, je_celodenni)."""
    if isinstance(hodnota, datetime):
        if hodnota.tzinfo is None:
            # „Plovoucí“ čas bez časového pásma – bereme ho jako náš čas
            hodnota = hodnota.replace(tzinfo=PRAHA)
        return hodnota.astimezone(PRAHA).isoformat(timespec="minutes"), False
    # Celodenní událost má jen datum (date), žádný čas
    return hodnota.isoformat(), True


def udalosti_z_kalendare(obsah, nazev_kalendare, od, do):
    kalendar = icalendar.Calendar.from_ical(obsah)
    udalosti = []
    # Knihovna rozepíše i opakované události („každé úterý“) a vynechá výjimky
    for udalost in recurring_ical_events.of(kalendar).between(od, do):
        if str(udalost.get("STATUS", "")).upper() == "CANCELLED":
            continue
        zacatek, celodenni = na_text(udalost.decoded("DTSTART"))
        konec = na_text(udalost.decoded("DTEND"))[0] if udalost.get("DTEND") else None
        udalosti.append({
            "nazev": str(udalost.get("SUMMARY", "")).strip() or "(bez názvu)",
            "zacatek": zacatek,
            "konec": konec,
            "celodenni": celodenni,
            "misto": str(udalost.get("LOCATION", "")).strip() or None,
            "kalendar": nazev_kalendare,
        })
    return udalosti


def main():
    dnes = datetime.now(PRAHA).replace(hour=0, minute=0, second=0, microsecond=0)
    od, do = dnes, dnes + timedelta(days=DNI_DOPREDU + 1)

    # Nevypisujeme názvy událostí, adresy kalendářů ani text chyb (mohl by
    # adresu obsahovat), jen počty – log je sice jen u tebe, ale pro jistotu.
    vsechny = []
    chyby = 0
    kalendare = nacti_kalendare()
    for poradi, (nazev, adresa) in enumerate(kalendare, start=1):
        try:
            udalosti = udalosti_z_kalendare(stahni(adresa), nazev, od, do)
            print(f"✓ kalendář č. {poradi}: {len(udalosti)} událostí")
            vsechny.extend(udalosti)
        except Exception as chyba:
            print(f"✗ kalendář č. {poradi} se nestáhl ({type(chyba).__name__})")
            chyby += 1
    if chyby == len(kalendare):
        raise SystemExit("✗ Nepodařilo se stáhnout žádný kalendář, nechávám stará data.")

    # Celodenní "2026-10-23" se seřadí před "2026-10-23T08:00…" – to chceme
    vsechny.sort(key=lambda u: (u["zacatek"], u["nazev"]))

    zmena = uloz_json(DATA / "udalosti.json", vsechny)
    zapis_stav("kalendar", pocet_chyb=chyby)
    print(f"Uloženo {len(vsechny)} událostí na {DNI_DOPREDU} dní" + ("" if zmena else " (beze změny)"))


if __name__ == "__main__":
    main()
