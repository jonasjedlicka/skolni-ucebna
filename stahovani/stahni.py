"""
Stáhne aktuální data z Edookitu, uloží je do data/*.json a nahraje na GitHub.

Spouštěj ze složky skolni-ucebna:

  .venv/bin/python stahovani/stahni.py --prihlasit    poprvé: otevře prohlížeč a ty se přihlásíš
  .venv/bin/python stahovani/stahni.py                stáhne data a nahraje je na GitHub
  .venv/bin/python stahovani/stahni.py --bez-nahrani  jen stáhne, na GitHub nic neposílá
"""

import argparse
import json
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

EDOOKIT = "https://gsgpraha.edookit.net"
PROJEKT = Path(__file__).resolve().parent.parent  # složka skolni-ucebna
DATA = PROJEKT / "data"
# Sem si prohlížeč ukládá přihlášení. Je v .gitignore – nikdy ho nenahrávej!
PROFIL = PROJEKT / ".edookit-prihlaseni"
# Edookit drží přihlášení v cookie, která by po zavření prohlížeče zmizela,
# proto si cookies po přihlášení uložíme sem a při stahování je načteme.
STAV = PROFIL / "prihlaseni.json"
JS = (Path(__file__).parent / "edookit.js").read_text(encoding="utf-8")

# Kolik týdnů rozvrhu projít. Běžný rozvrh se pozná podle toho,
# co se v těch týdnech opakuje; jednorázové změny (supl, zrušení) propadnou.
POCET_TYDNU = 4
DNY = ["pondeli", "utery", "streda", "ctvrtek", "patek"]


# ---------- Práce s prohlížečem ----------


# Bez tohohle by Google/Microsoft mohly přihlášení odmítnout,
# protože poznají, že prohlížeč ovládá program.
SKRYT_AUTOMATIZACI = {
    "args": ["--disable-blink-features=AutomationControlled"],
    "ignore_default_args": ["--enable-automation"],
}


def otevri_prohlizec_pro_prihlaseni(p):
    # Viditelné okno s vlastním profilem: Google/Microsoft si tě v něm pamatují,
    # takže příští přihlášení bude rychlejší.
    return p.chromium.launch_persistent_context(
        str(PROFIL), headless=False, locale="cs-CZ", **SKRYT_AUTOMATIZACI
    )


def otevri_neviditelny_prohlizec(p):
    prohlizec = p.chromium.launch(headless=True, **SKRYT_AUTOMATIZACI)
    # Neviditelný prohlížeč se jinak představuje jako „HeadlessChrome“,
    # Edookit by ho pak mohl brát jako jiný prohlížeč a přihlášení neuznat.
    user_agent = prohlizec.new_page().evaluate("navigator.userAgent").replace("HeadlessChrome", "Chrome")
    kontext = prohlizec.new_context(storage_state=str(STAV), locale="cs-CZ", user_agent=user_agent)
    return prohlizec, kontext


# Odkaz „Odhlásit se“ je v menu jen tehdy, když jsi přihlášený.
# Podle adresy to poznat nejde: Edookit nejdřív otevře hlavní stránku
# a teprve pak přesměruje na přihlášení.
ODHLASIT = 'a[href="/user/logout"]'


def je_prihlaseny(stranka):
    return stranka.locator(ODHLASIT).count() > 0


def klikni(stranka, odkaz):
    # Přepínání týdnů v Edookitu funguje jen kliknutím na odkaz.
    # Když stejnou adresu otevřeme přímo, Edookit ji ignoruje.
    with stranka.expect_navigation():
        stranka.locator(odkaz).first.click()


DALSI_TYDEN = 'a[href*="familyTimetable-value=7"]'
AKTUALNI_TYDEN = 'a[href*="familyTimetable-resetFilter"]'


def spust_js(stranka, funkce):
    # Vloží do stránky celý edookit.js a zavolá z něj jednu funkci
    return stranka.evaluate(f"() => {{\n{JS}\nreturn {funkce}();\n}}")


def prihlasit():
    with sync_playwright() as p:
        prohlizec = otevri_prohlizec_pro_prihlaseni(p)
        stranka = prohlizec.new_page()
        stranka.goto(EDOOKIT)
        print("Přihlas se v okně prohlížeče, které se otevřelo. Čekám až 5 minut…")
        # Hotovo je, až se v Edookitu objeví odkaz „Odhlásit se“
        stranka.wait_for_selector(ODHLASIT, state="attached", timeout=5 * 60 * 1000)
        prohlizec.storage_state(path=str(STAV))  # uložíme cookies dřív, než okno zavřeme
        prohlizec.close()
    print("✓ Přihlášeno. Teď spusť skript bez --prihlasit.")


def stahni_z_edookitu():
    if not STAV.exists():
        sys.exit("✗ Ještě ses nepřihlásil. Spusť skript s --prihlasit.")

    with sync_playwright() as p:
        prohlizec, kontext = otevri_neviditelny_prohlizec(p)
        stranka = kontext.new_page()

        stranka.goto(EDOOKIT + "/timetable/")
        if not je_prihlaseny(stranka):
            prohlizec.close()
            sys.exit("✗ Přihlášení do Edookitu vypršelo. Spusť skript s --prihlasit.")

        print("Čtu rozvrh…")
        # Edookit si pamatuje naposledy zobrazený týden, tak nejdřív na ten aktuální
        klikni(stranka, AKTUALNI_TYDEN)
        tydny = [spust_js(stranka, "prectiTyden")]
        for _ in range(POCET_TYDNU - 1):
            klikni(stranka, DALSI_TYDEN)
            tydny.append(spust_js(stranka, "prectiTyden"))
        # Vrátíme Edookit zpátky na aktuální týden, ať tě to pak na webu nemate
        klikni(stranka, AKTUALNI_TYDEN)

        print("Čtu písemky…")
        stranka.goto(EDOOKIT + "/exams/")
        pisemky = spust_js(stranka, "prectiPisemky")

        print("Čtu učivo…")
        stranka.goto(EDOOKIT + "/courses/")
        ucivo = spust_js(stranka, "prectiUcivo")

        # Edookit může cookie během návštěvy obnovit, tak si uložíme tu nejnovější
        kontext.storage_state(path=str(STAV))
        prohlizec.close()
    return tydny, pisemky, ucivo


# ---------- Převod na naše JSON soubory ----------


def sestav_rozvrh(tydny, zkratky):
    casy = {}
    vyskyty = defaultdict(Counter)  # (den, hodina) → kolikrát jaký (předmět, učebna)
    dny_s_vyukou = defaultdict(set)  # den → data, kdy se ten den učilo
    videno = set()
    nezname = set()

    for tyden in tydny:
        for cas in tyden["casy"]:
            casy[str(cas["hodina"])] = {"od": cas["od"], "do": cas["do"]}
        for h in tyden["hodiny"]:
            if (h["datum"], h["hodina"]) in videno:
                continue  # stejný týden načtený dvakrát
            videno.add((h["datum"], h["hodina"]))

            datum = date.fromisoformat(h["datum"])
            if datum.weekday() > 4:
                continue  # sobota, neděle
            den = DNY[datum.weekday()]
            dny_s_vyukou[den].add(datum)

            predmet = zkratky.get(h["zkratka"].lower())
            if not predmet:
                nezname.add(h["zkratka"])
                continue
            vyskyty[(den, h["hodina"])][(predmet["id"], h["ucebna"])] += 1

    dny = {den: [] for den in DNY}
    for (den, hodina), pocty in sorted(vyskyty.items(), key=lambda x: (DNY.index(x[0][0]), x[0][1])):
        # Hodina patří do běžného rozvrhu, jen když tam byla ve víc než
        # polovině týdnů, kdy se ten den učilo. Bere se nejčastější předmět.
        if sum(pocty.values()) * 2 <= len(dny_s_vyukou[den]):
            continue
        (predmet_id, ucebna), _ = pocty.most_common(1)[0]
        dny[den].append({"hodina": hodina, "predmet": predmet_id, "ucebna": ucebna})

    # Kolik různých týdnů se opravdu načetlo (podle pondělí každého data)
    pondeli = {datum - timedelta(days=datum.weekday()) for data in dny_s_vyukou.values() for datum in data}
    return {"casy": casy, "dny": dny}, nezname, len(pondeli)


def najdi_rok(den, mesic, dnes):
    # Edookit u písemek rok nepíše. Vezmeme ten, se kterým je datum nejblíž dnešku
    # (v lednu je „10. 12.“ minulý prosinec, v prosinci je „10. 1.“ příští leden).
    moznosti = [date(dnes.year + posun, mesic, den) for posun in (-1, 0, 1)]
    return min(moznosti, key=lambda d: abs((d - dnes).days))


def sestav_testy(pisemky, zkratky, casy):
    dnes = date.today()
    zacatek_na_hodinu = {cas["od"]: int(hodina) for hodina, cas in casy.items()}
    testy = []
    nezname = set()

    for p in pisemky:
        datum = najdi_rok(p["den"], p["mesic"], dnes)
        if datum < dnes:
            continue  # už proběhla

        predmet = zkratky.get(p["zkratka"].lower())
        if not predmet:
            nezname.add(p["zkratka"])
        od = p["od"].zfill(5) if p["od"] else None  # "8:55" → "08:55"

        test = {
            "datum": datum.isoformat(),
            "hodina": zacatek_na_hodinu.get(od),
            "predmet": predmet["id"] if predmet else p["zkratka"],
            "typ": p["typ"],
            "tema": p["tema"],
        }
        testy.append({klic: hodnota for klic, hodnota in test.items() if hodnota is not None})

    testy.sort(key=lambda t: t["datum"])
    return testy, nezname


def aktualizuj_temata(predmety, ucivo):
    temata = {}
    for u in ucivo:
        if u["ucivo"] and not u["neaktivni"]:
            # Předmět bývá v Edookitu dvakrát (celá třída + skupina), bereme první vyplněné
            temata.setdefault(u["zkratka"].lower(), u["ucivo"])
    for predmet in predmety:
        tema = temata.get(predmet["zkratka"].lower())
        if tema:
            predmet["aktualniTema"] = tema
    # Materiály a vše ostatní, co sis k předmětům dopsal ručně, zůstává beze změny
    return predmety


# ---------- Ukládání a nahrání ----------


def uloz(nazev, data):
    """Uloží JSON. Vrátí True, jen když se obsah opravdu změnil."""
    cesta = DATA / nazev
    novy_text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if cesta.exists() and cesta.read_text(encoding="utf-8") == novy_text:
        return False
    cesta.write_text(novy_text, encoding="utf-8")
    return True


def nahraj_na_github(soubory):
    def git(*argumenty):
        subprocess.run(["git", *argumenty], cwd=PROJEKT, check=True)

    git("add", *[f"data/{nazev}" for nazev in soubory])
    git("commit", "-m", f"Aktualizace dat z Edookitu ({date.today():%-d. %-m. %Y})")
    git("push")
    print("✓ Nahráno na GitHub. Web se aktualizuje asi do minuty.")


def main():
    parser = argparse.ArgumentParser(description="Stáhne data z Edookitu do Učebny.")
    parser.add_argument("--prihlasit", action="store_true", help="otevře prohlížeč pro přihlášení")
    parser.add_argument("--bez-nahrani", action="store_true", help="nenahrávat změny na GitHub")
    argumenty = parser.parse_args()

    if argumenty.prihlasit:
        prihlasit()
        return

    tydny, pisemky, ucivo = stahni_z_edookitu()

    predmety = json.loads((DATA / "predmety.json").read_text(encoding="utf-8"))
    zkratky = {p["zkratka"].lower(): p for p in predmety}

    rozvrh, nezname_rozvrh, pocet_tydnu = sestav_rozvrh(tydny, zkratky)
    testy, nezname_testy = sestav_testy(pisemky, zkratky, rozvrh["casy"])
    predmety = aktualizuj_temata(predmety, ucivo)

    zmenene = []
    pocet_hodin = sum(len(hodiny) for hodiny in rozvrh["dny"].values())
    # Pojistky: když by se rozvrh načetl skoro prázdný (např. Edookit změnil vzhled)
    # nebo jen z jednoho týdne (to by v něm zůstaly suply), starý radši nepřepíšeme.
    if pocet_hodin < 10:
        print(f"! Rozvrh má jen {pocet_hodin} hodin, nechávám ten starý.")
    elif pocet_tydnu < 2:
        print(f"! Načetl se jen {pocet_tydnu} týden rozvrhu, nechávám ten starý.")
    elif uloz("rozvrh.json", rozvrh):
        zmenene.append("rozvrh.json")
    if uloz("testy.json", testy):
        zmenene.append("testy.json")
    if uloz("predmety.json", predmety):
        zmenene.append("predmety.json")

    print(f"Rozvrh: {pocet_hodin} hodin týdně · nadcházející testy: {len(testy)}")
    nezname = (nezname_rozvrh | nezname_testy) - {"O3.D"}  # O3.D = oběd
    if nezname:
        print("! Neznámé předměty (přidej je do data/predmety.json):", ", ".join(sorted(nezname)))

    if not zmenene:
        print("✓ Žádné změny, data jsou aktuální.")
    elif argumenty.bez_nahrani:
        print("✓ Změněno:", ", ".join(zmenene), "(na GitHub jsem nic neposílal)")
    else:
        print("Změněno:", ", ".join(zmenene))
        nahraj_na_github(zmenene)


if __name__ == "__main__":
    main()
