"""
Modul OBĚDY: stáhne jídelníček z e-jidelnicek.cz a v pátek objedná obědy
na příští týden – vybere menu, které je nutričně lepší (viz NUTRICNI_PRAVIDLA).
Neoblíbená jídla nevybere nikdy, oblíbená rozhodnou jen při shodě.

Pravidla jídelny: objednat nebo změnit jde do 11:00 posledního pracovního
dne před obědem (na pondělí tedy do pátku 11:00), zrušit do 14:00.
Skript obědy NIKDY neruší – jen vybírá mezi Menu 1 a Menu 2.

Kdy běží (launchd/cz.dashboard.obedy.plist): v pátek v 8:00, po zapnutí
Macu a pak každou hodinu. Sám pozná, jestli je co dělat:
  - od pátku 8:00 objedná příští týden (jednou; znovu jen když změníš přání),
  - když Mac v pátek spal nebo byl vypnutý, objedná hned, jakmile to jde –
    dny, kterým už prošla uzávěrka, jen nahlásí v dashboardu,
  - jídelníček pro dashboard obnoví, když je starší než 6 hodin.

  .venv/bin/python stahovani/obedy.py --prihlasit    poprvé: otevře okno a ty se přihlásíš
  .venv/bin/python stahovani/obedy.py                co je na řadě (běží samo)
  .venv/bin/python stahovani/obedy.py --nanecisto    jen ukáže, co by objednal, nic nezmění
  .venv/bin/python stahovani/obedy.py --objednat     objedná hned (i mimo pátek)
  .venv/bin/python stahovani/obedy.py --jidelnicek   jen stáhne jídelníček, nic neobjednává

Oblíbená a neoblíbená jídla zadáváš v dashboardu (Škola → Obědy).
Nutriční hodnocení se počítá z názvu jídla – jídelna kalorie ani živiny neuvádí.
Výsledky: ~/Dashboard-data/obedy/ (jidelnicek.json, objednavka.json).
"""

import argparse
import hashlib
import json
import subprocess
import unicodedata
from datetime import date, datetime, timedelta

from playwright.sync_api import sync_playwright

from umisteni import DATA, uloz_json, zapis_stav  # stahovani/umisteni.py

WEB = "https://e-jidelnicek.cz"
SLOZKA = DATA / "obedy"
PROFIL = DATA / ".jidelnicek-prihlaseni"  # uložené přihlášení (jako u Edookitu)
PREFERENCE = DATA / "zapisy" / "obedy.json"  # co zadáš v dashboardu
OBJEDNAVKA = SLOZKA / "objednavka.json"
JIDELNICEK = SLOZKA / "jidelnicek.json"
OBNOVIT_JIDELNICEK_PO = timedelta(hours=6)
HODINA_OBJEDNAVANI = 8  # v pátek od 8:00


# ---------- Pomocné ----------


def upozorni(zprava):
    """Oznámení vpravo nahoře na Macu."""
    prikaz = f"display notification {json.dumps(zprava, ensure_ascii=False)} with title \"Obědy\""
    subprocess.run(["osascript", "-e", prikaz], check=False)


def bez_diakritiky(text):
    # „Kuřecí“ → „kureci“, ať se najde i bez háčků a v jiném tvaru
    return "".join(z for z in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(z) != "Mn")


def pondeli(den):
    return den - timedelta(days=den.weekday())


def cilovy_tyden(ted):
    """Pondělí týdne, který se má objednat. Od pátku 8:00 je to příští týden,
    jinak tenhle (dohnání, když Mac v pátek spal nebo byl vypnutý)."""
    tento = pondeli(ted.date())
    patek_8 = datetime.combine(tento + timedelta(days=4), datetime.min.time()).replace(hour=HODINA_OBJEDNAVANI)
    return tento + timedelta(days=7) if ted >= patek_8 else tento


def nacti_preference():
    """Slova z dashboardu: {"oblibene": [...], "neoblibene": [...]}"""
    try:
        polozky = json.loads(PREFERENCE.read_text(encoding="utf-8"))["polozky"].values()
    except (OSError, ValueError, KeyError):
        polozky = []
    vysledek = {"oblibene": [], "neoblibene": []}
    for p in polozky:
        if not p.get("smazano") and p.get("druh") in vysledek and p.get("slovo"):
            vysledek[p["druh"]].append(bez_diakritiky(p["slovo"]))
    return vysledek


def otisk_preferenci(preference):
    """Krátký otisk přání a pravidel hodnocení – podle něj skript pozná, že se od
    objednání změnilo, podle čeho se vybírá (pak dny, které jdou změnit, přepočítá)."""
    podklad = {"preference": preference, "pravidla": NUTRICNI_PRAVIDLA}
    return hashlib.sha1(json.dumps(podklad, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]


# Nutriční hodnocení podle názvu jídla. Jídelna kalorie ani živiny neuvádí, takže
# se řídíme obecnými doporučeními: víc bílkovin z libového masa, ryb a luštěnin,
# víc zeleniny, šetrná úprava; méně smaženého, uzenin, sladkých hlavních jídel
# a těžkých omáček. Každé pravidlo se u jídla počítá nejvýš jednou.
# (název, body, kousky slov bez diakritiky)
NUTRICNI_PRAVIDLA = [
    ("libové maso / ryba / vejce", 2, ["kureci", "kure", "kruti", "krocan", "ryb", "losos", "tresk", "pstruh", "tunak", "vejc", "vajec", "tofu"]),
    ("luštěniny", 2, ["cock", "fazol", "cizrn", "hrach", "soj"]),
    ("zelenina", 2, ["zelenin", "salat", "brokolic", "spenat", "mrkev", "mrkv", "rajc", "paprik", "cuket", "dyne", "kvetak", "zeli", "repa", "lilek"]),
    ("šetrná úprava", 1, ["dusen", "pecen", "gril", "na pare", "varen", "var."]),
    ("celozrnná příloha", 1, ["pohank", "jahl", "bulgur", "kuskus", "celozrn", "quinoa", "ovesn"]),
    ("smažené", -2, ["smazen", "testick", "trojobal", "rizek", "hranolk", "krokety", "obalovan", "nugget"]),
    ("uzeniny", -2, ["parek", "parky", "klobas", "uzen", "slanin", "debrecin", "vurt", "salam"]),
    ("sladké hlavní jídlo", -2, ["krupicov", "kakao", "cukr", "buchty", "buchtick", "palacink", "livanc", "nakyp", "dukat", "sisky", "s makem", "ovocne knedliky", "zemlovk", "trhanec", "kolac", "slad"]),
    ("těžká omáčka / zapečené", -1, ["smetan", "svickov", "syrov", "zapecen", "gratin", "majonez", "tatark"]),
    ("knedlíky", -1, ["knedlik"]),
]


def nutricni_hodnoceni(nazev):
    """Vrátí {"skore": číslo, "duvody": ["zelenina +2", …]}."""
    text = bez_diakritiky(nazev)
    duvody = []
    for popis, body, slova in NUTRICNI_PRAVIDLA:
        if any(slovo in text for slovo in slova):
            duvody.append(f"{popis} {body:+d}")
    skore = sum(int(d.rsplit(" ", 1)[1]) for d in duvody)
    return {"skore": skore, "duvody": duvody}


def skore(jidlo, preference):
    """Celkové skóre menu: nutriční hodnocení rozhoduje. Neoblíbené jídlo −100
    (nevybereme ho nikdy), oblíbené +0,1 (rozhodne jen při stejném nutričním skóre)."""
    text = bez_diakritiky(jidlo["nazev"])
    oblibene = 0.1 * sum(1 for s in preference["oblibene"] if s in text)
    neoblibene = 100 * sum(1 for s in preference["neoblibene"] if s in text)
    return nutricni_hodnoceni(jidlo["nazev"])["skore"] + oblibene - neoblibene


def vyber_menu(menu, preference):
    """Ze seznamu menu jednoho dne vybere nejlepší. Při shodě nechá, co je objednané
    (zbytečně neměníme), jinak první (Menu 1)."""
    objednane = next((m for m in menu if m["objednano"]), None)
    nejlepsi = max(menu, key=lambda m: (skore(m, preference), m is objednane, -menu.index(m)))
    return nejlepsi


# ---------- Prohlížeč ----------


def otevri(p, viditelne=False):
    return p.chromium.launch_persistent_context(
        str(PROFIL), headless=not viditelne, locale="cs-CZ", viewport={"width": 1100, "height": 1400}
    )


def prihlasit():
    with sync_playwright() as p:
        prohlizec = otevri(p, viditelne=True)
        stranka = prohlizec.pages[0] if prohlizec.pages else prohlizec.new_page()
        stranka.goto(WEB + "/login")
        print("Přihlas se v otevřeném okně. Až uvidíš svůj účet, okno se zavře samo (čekám max. 5 minut).")
        stranka.wait_for_url("**/logged/**", timeout=300_000)
        stranka.wait_for_timeout(2000)  # ať se přihlášení stihne uložit
        prohlizec.close()
    print("✓ Přihlášeno. Skript si přihlášení pamatuje.")


def otevri_objednavky(stranka):
    stranka.goto(WEB + "/logged/home")
    stranka.wait_for_load_state("networkidle")
    if "/login" in stranka.url:
        raise RuntimeError("Přihlášení do e-jidelnicek.cz vypršelo – spusť stahovani/obedy.py --prihlasit")
    stranka.get_by_text("Objednávka", exact=True).first.click()
    stranka.wait_for_selector(".print-den", timeout=30_000)
    # Další dny se načítají až při posouvání dolů
    pocet = -1
    for _ in range(8):
        dny = stranka.locator(".print-den").count()
        if dny == pocet:
            break
        pocet = dny
        stranka.mouse.wheel(0, 6000)
        stranka.wait_for_timeout(1500)


def precti_dny(stranka):
    """Všechny zobrazené dny: datum a jídla (druh, název, objednáno, zamčeno)."""
    dny = []
    karty = stranka.locator(".q-card__section:has(> .print-den)")
    for i in range(karty.count()):
        karta = karty.nth(i)
        datum_text = karta.locator(".print-den span.q-ml-xs").first.inner_text().strip()  # „27. 10. 2026“
        den, mesic, rok = [int(c) for c in datum_text.replace(" ", "").strip(".").split(".")]
        jidla = []
        radky = karta.locator(".menu-box")
        for j in range(radky.count()):
            radek = radky.nth(j)
            prepinac = radek.locator(".q-toggle[role=checkbox]").first
            if prepinac.count() == 0:
                continue
            jidla.append({
                "druh": radek.locator(".menu-type").first.inner_text().strip(),
                "nazev": radek.locator(".print-jidlo .text-left").first.inner_text().strip(),
                "objednano": prepinac.get_attribute("aria-checked") == "true",
                "zamceno": prepinac.get_attribute("aria-disabled") == "true",
                "_index": j,
            })
        dny.append({"datum": date(rok, mesic, den).isoformat(), "jidla": jidla})
    return dny


def objednej_menu(stranka, datum, druh):
    """Klikne na přepínač daného menu v daném dni a počká, až se objednávka uloží."""
    d = date.fromisoformat(datum)
    karta = stranka.locator(".q-card__section:has(> .print-den)").filter(has_text=f"{d.day}. {d.month}. {d.year}").first
    radek = karta.locator(".menu-box").filter(has=stranka.locator(".menu-type", has_text=druh)).first
    prepinac = radek.locator(".q-toggle[role=checkbox]").first
    prepinac.click()
    # Jídelna objednávku ukládá přes internet – počkáme, až přepínač ukáže „objednáno“
    stranka.wait_for_function(
        "el => el.getAttribute('aria-checked') === 'true'", arg=prepinac.element_handle(), timeout=15_000
    )
    stranka.wait_for_timeout(1500)


# ---------- Hlavní logika ----------


def uloz_jidelnicek(dny):
    # Ke každému menu přidáme nutriční hodnocení – dashboard ho ukazuje i s důvody
    verejne = [
        {
            "datum": d["datum"],
            "jidla": [
                {**{k: v for k, v in j.items() if not k.startswith("_")},
                 **({"nutri": nutricni_hodnoceni(j["nazev"])} if j["druh"].lower().startswith("menu") else {})}
                for j in d["jidla"]
            ],
        }
        for d in dny
    ]
    uloz_json(JIDELNICEK, {"dny": verejne})
    zapis_stav("obedy")


def naplanuj(dny, tyden, preference):
    """Pro dny cílového týdne rozhodne, co objednat. Vrátí seznam kroků."""
    kroky = []
    konec = tyden + timedelta(days=4)
    for den in dny:
        datum = date.fromisoformat(den["datum"])
        if not (tyden <= datum <= konec):
            continue
        menu = [j for j in den["jidla"] if j["druh"].lower().startswith("menu")]
        if not menu:
            continue  # nevaří se (svátek, prázdniny)
        vybrane = vyber_menu(menu, preference)
        objednane = next((m for m in menu if m["objednano"]), None)
        krok = {"datum": den["datum"], "menu": vybrane["druh"], "nazev": vybrane["nazev"], "zmena": vybrane is not objednane}
        if krok["zmena"] and vybrane["zamceno"]:
            krok["zmeskano"] = True  # uzávěrka už prošla – jen nahlásíme
        kroky.append(krok)
    return kroky


def main():
    parser = argparse.ArgumentParser(description="Obědy z e-jidelnicek.cz")
    parser.add_argument("--prihlasit", action="store_true", help="otevře okno pro přihlášení")
    parser.add_argument("--nanecisto", action="store_true", help="jen ukázat, co by se objednalo")
    parser.add_argument("--objednat", action="store_true", help="objednat hned (i mimo pátek)")
    parser.add_argument("--jidelnicek", action="store_true", help="jen stáhnout jídelníček")
    argumenty = parser.parse_args()
    if argumenty.prihlasit:
        prihlasit()
        return

    ted = datetime.now()
    tyden = cilovy_tyden(ted)
    try:
        stav = json.loads(OBJEDNAVKA.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        stav = {}
    # Hotovo = tenhle týden už objednaný A od té doby se nezměnila tvoje přání
    # (když je změníš, dny, které ještě jdou změnit, se při další kontrole přepočítají)
    otisk = otisk_preferenci(nacti_preference())
    hotovo = stav.get("tyden") == tyden.isoformat() and stav.get("stav") == "hotovo" and stav.get("preference") == otisk
    objednat = (argumenty.objednat or argumenty.nanecisto or not hotovo) and not argumenty.jidelnicek

    # Když není co objednat a jídelníček je čerstvý, prohlížeč vůbec nespouštíme
    try:
        cerstvy = ted - datetime.fromtimestamp(JIDELNICEK.stat().st_mtime) < OBNOVIT_JIDELNICEK_PO
    except OSError:
        cerstvy = False
    if not objednat and cerstvy and not argumenty.jidelnicek:
        return

    print(f"=== {ted:%-d. %-m. %Y %H:%M} · týden od {tyden:%-d. %-m.} ===")
    with sync_playwright() as p:
        prohlizec = otevri(p)
        stranka = prohlizec.pages[0] if prohlizec.pages else prohlizec.new_page()
        try:
            otevri_objednavky(stranka)
            dny = precti_dny(stranka)
            if not argumenty.nanecisto:
                uloz_jidelnicek(dny)
            print(f"Jídelníček: {len(dny)} dní")
            if not objednat:
                return

            preference = nacti_preference()
            kroky = naplanuj(dny, tyden, preference)
            if not kroky:
                # Jídelníček na cílový týden ještě není – zkusíme to za hodinu znovu
                print("Jídelníček na cílový týden ještě není zveřejněný.")
                if not argumenty.nanecisto:
                    uloz_json(OBJEDNAVKA, {"tyden": tyden.isoformat(), "stav": "ceka-na-jidelnicek", "cas": ted.isoformat(timespec="minutes"), "dny": []})
                return

            for krok in kroky:
                popis = f"{krok['datum']}: {krok['menu']} – {krok['nazev']}"
                if not krok["zmena"]:
                    print(f"  = {popis} (už objednáno)")
                elif krok.get("zmeskano"):
                    print(f"  ! {popis} – uzávěrka prošla, nejde změnit")
                elif argumenty.nanecisto:
                    print(f"  → {popis} (nanečisto – nic neměním)")
                else:
                    try:
                        objednej_menu(stranka, krok["datum"], krok["menu"])
                        krok["objednano"] = True
                        print(f"  ✓ {popis}")
                    except Exception as chyba:  # jeden den nesmí zastavit ostatní
                        krok["chyba"] = str(chyba).splitlines()[0]
                        print(f"  ✗ {popis}: {krok['chyba']}")

            if argumenty.nanecisto:
                return
            # Po objednání přečíst stránku znovu – kontrola, že je objednané jen jedno menu
            otevri_objednavky(stranka)
            dny = precti_dny(stranka)
            uloz_jidelnicek(dny)
            for krok in kroky:
                den = next((d for d in dny if d["datum"] == krok["datum"]), None)
                objednana = [j["druh"] for j in (den or {}).get("jidla", []) if j["objednano"] and j["druh"].lower().startswith("menu")]
                if len(objednana) > 1:
                    krok["chyba"] = f"objednaná jsou {len(objednana)} menu – zkontroluj a jedno zruš (do 14:00)"

            problemy = [k for k in kroky if k.get("chyba") or k.get("zmeskano")]
            uloz_json(OBJEDNAVKA, {
                "tyden": tyden.isoformat(),
                "stav": "hotovo",
                "preference": otisk,
                "cas": ted.isoformat(timespec="minutes"),
                "dny": kroky,
            })
            zmeny = sum(1 for k in kroky if k.get("objednano"))
            if problemy:
                upozorni(f"Obědy: {len(problemy)} dní se nepodařilo objednat podle přání – podívej se do dashboardu.")
            elif zmeny:
                upozorni(f"Obědy na příští týden objednány ({zmeny} změn).")
            print(f"Hotovo: {zmeny} změn, {len(problemy)} problémů")
        finally:
            prohlizec.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as chyba:
        # Chybu zapíšeme pro dashboard (upozornění) a necháme vyletět do logu
        uloz_json(OBJEDNAVKA, {
            **(json.loads(OBJEDNAVKA.read_text(encoding="utf-8")) if OBJEDNAVKA.exists() else {}),
            "chyba": str(chyba).splitlines()[0],
            "chyba_cas": datetime.now().isoformat(timespec="minutes"),
        })
        upozorni("Obědy: " + str(chyba).splitlines()[0])
        raise
