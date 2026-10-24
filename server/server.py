"""
Lokální server dashboardu. Běží jen na tomhle Macu a poslouchá jen na
127.0.0.1 – z Wi-Fi ani z internetu se k němu nikdo nedostane. K iPhonu ho
pustí až Tailscale (tailscale serve), a to jen přes tvou soukromou síť.

Co dělá:
  - posílá stránky dashboardu (html, js, css, ikony) z repozitáře,
  - posílá data z ~/Dashboard-data (rozvrh, zprávy, akcie…) – jen přihlášenému,
  - ukládá zápisy (úkoly, poznámky, známky…) do ~/Dashboard-data/zapisy,
  - hlídá přihlášení heslem (druhá pojistka vedle Tailscale).

Spouští ho macOS sám po zapnutí (launchd/cz.dashboard.server.plist).
Ručně:  .venv/bin/python server/server.py   →  http://localhost:8765
Heslo nastavíš:  .venv/bin/python server/nastav_heslo.py

Používá jen standardní knihovnu Pythonu.
"""

import hashlib
import hmac
import json
import mimetypes
import os
import posixpath
import re
import secrets
import sys
import threading
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "stahovani"))
from umisteni import DATA, NASTAVENI, uloz_json  # noqa: E402  (stahovani/umisteni.py)

ADRESA = "127.0.0.1"  # jen tenhle Mac – nikdy ne 0.0.0.0
PORT = int(os.environ.get("DASHBOARD_PORT", 8765))
WEB = Path(__file__).resolve().parent.parent  # složka repozitáře se stránkami

HESLO = NASTAVENI / "prihlaseni.json"  # jen otisk hesla (PBKDF2), ne heslo samo
RELACE = NASTAVENI / "relace.json"  # přihlášená zařízení
ZAPISY = DATA / "zapisy"
COOKIE = "dashboard_relace"
PLATNOST_RELACE = 60 * 60 * 24 * 30  # přihlášení vydrží 30 dní

# Co smí server poslat ze složky repozitáře (nic jiného – ani skripty, ani .git)
VEREJNE_SLOZKY = ("js/", "css/", "ikony/")
VEREJNE_SOUBORY = {"manifest.webmanifest", "sw.js"}
# Bez přihlášení jde jen přihlašovací stránka a to, co potřebuje (vzhled, ikony)
# (sw.js neobsahuje nic osobního a prohlížeč ho stahuje i mimo stránku – při aktualizaci)
BEZ_PRIHLASENI = ("/prihlaseni.html", "/css/", "/ikony/", "/js/prihlaseni.js", "/manifest.webmanifest", "/sw.js")
# Data, která smí prohlížeč číst (zápisy jdou přes /api/zapisy, nastavení nikdy)
DATOVE_SLOZKY = {"skola", "zpravy", "akcie", "kalendar", "obedy"}

ZAMEK = threading.Lock()  # zápisy a relace mění vždy jen jedno vlákno naráz
neuspesne_pokusy = {"pocet": 0, "do": 0.0}

mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("text/javascript", ".js")


# ---------- Heslo a relace ----------


def over_heslo(heslo):
    try:
        ulozene = json.loads(HESLO.read_text(encoding="utf-8"))
    except OSError:
        return False
    otisk = hashlib.pbkdf2_hmac("sha256", heslo.encode(), bytes.fromhex(ulozene["sul"]), ulozene["iterace"])
    return hmac.compare_digest(otisk.hex(), ulozene["otisk"])  # porovnání bez prozrazení času


def nacti_relace():
    try:
        relace = json.loads(RELACE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    ted = time.time()
    return {k: v for k, v in relace.items() if v > ted}  # prošlé zahodíme


def otisk_relace(token):
    # Do souboru ukládáme jen otisk – kdyby soubor někdo viděl, přihlásit se s ním nedá
    return hashlib.sha256(token.encode()).hexdigest()


def nova_relace():
    token = secrets.token_urlsafe(32)
    with ZAMEK:
        relace = nacti_relace()
        relace[otisk_relace(token)] = time.time() + PLATNOST_RELACE
        uloz_json(RELACE, relace)
    return token


def zrus_relaci(token):
    with ZAMEK:
        relace = nacti_relace()
        relace.pop(otisk_relace(token), None)
        uloz_json(RELACE, relace)


# ---------- Zápisy ----------


def verze_textu(text):
    return hashlib.sha1(text.encode()).hexdigest()


def cesta_zapisu(nazev):
    if not re.fullmatch(r"[a-z]{1,30}", nazev):
        return None
    return ZAPISY / f"{nazev}.json"


def precti_zapisy(cesta):
    if not cesta.exists():
        return {"polozky": {}}, None
    text = cesta.read_text(encoding="utf-8")
    return json.loads(text), verze_textu(text)


# ---------- Obsluha požadavků ----------


class Obsluha(BaseHTTPRequestHandler):
    server_version = "Dashboard"
    sys_version = ""

    def log_message(self, format, *args):  # noqa: A002 – jméno určuje knihovna
        pass  # neukládáme každý požadavek do logu

    # --- pomocné ---

    def token(self):
        cookie = SimpleCookie(self.headers.get("Cookie", ""))
        return cookie[COOKIE].value if COOKIE in cookie else None

    def prihlaseny(self):
        token = self.token()
        return bool(token) and otisk_relace(token) in nacti_relace()

    def bezpecnostni_hlavicky(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        # Stránka smí načítat jen vlastní soubory; navíc počasí z Open-Meteo
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; "
            "img-src 'self' data:; connect-src 'self' https://api.open-meteo.com; "
            "frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        )

    def odpovez_json(self, kod, data, hlavicky=()):
        telo = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(kod)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(telo)))
        self.send_header("Cache-Control", "no-store")
        for nazev, hodnota in hlavicky:
            self.send_header(nazev, hodnota)
        self.bezpecnostni_hlavicky()
        self.end_headers()
        self.wfile.write(telo)

    def odpovez_souborem(self, cesta):
        telo = cesta.read_bytes()
        typ = mimetypes.guess_type(cesta.name)[0] or "application/octet-stream"
        if typ.startswith("text/") or typ.endswith(("json", "javascript")):
            typ += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", typ)
        self.send_header("Content-Length", str(len(telo)))
        # no-cache = prohlížeč si soubor nechá, ale vždy se zeptá, jestli není novější
        self.send_header("Cache-Control", "no-cache")
        self.send_header("ETag", '"' + hashlib.sha1(telo).hexdigest() + '"')
        self.bezpecnostni_hlavicky()
        self.end_headers()
        self.wfile.write(telo)

    def presmeruj(self, kam):
        self.send_response(303)
        self.send_header("Location", kam)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def precti_telo(self):
        delka = int(self.headers.get("Content-Length", 0))
        if delka > 5_000_000:  # zápisy jsou malé; víc je podezřelé
            raise ValueError("Příliš velký požadavek.")
        return json.loads(self.rfile.read(delka) or b"{}")

    def povoleny_host(self):
        # Ochrana proti „DNS rebinding“: přijímáme jen požadavky na tenhle Mac
        # (localhost) nebo přes Tailscale (*.ts.net)
        host = (self.headers.get("Host") or "").split(":")[0].lower()
        return host in ("localhost", "127.0.0.1") or host.endswith(".ts.net")

    # --- GET ---

    def do_GET(self):  # noqa: N802 – jméno určuje knihovna
        if not self.povoleny_host():
            return self.odpovez_json(403, {"chyba": "Nepovolená adresa."})
        # posixpath.normpath vyřeší „/css/../data/…“ dřív, než rozhodneme o přihlášení
        cesta = posixpath.normpath(unquote(urlsplit(self.path).path))
        if cesta == "/":
            cesta = "/index.html"

        if not self.prihlaseny() and not cesta.startswith(BEZ_PRIHLASENI):
            if cesta.endswith(".html"):
                return self.presmeruj("/prihlaseni.html?dalsi=" + quote(self.path, safe=""))
            return self.odpovez_json(401, {"chyba": "Nejsi přihlášený."})

        if cesta.startswith("/api/zapisy/"):
            return self.nacti_zapisy(cesta.removeprefix("/api/zapisy/"))
        if cesta.startswith("/data/"):
            return self.posli_data(cesta.removeprefix("/data/"))
        return self.posli_stranku(cesta.lstrip("/"))

    def posli_stranku(self, relativni):
        # Nejdřív skutečná cesta (vyřeší „..“ i odkazy), teprve pak kontrola –
        # jinak by „js/../stahovani/…“ prošlo kontrolou a poslalo cizí soubor
        soubor = (WEB / relativni).resolve()
        if not soubor.is_relative_to(WEB) or not soubor.is_file():
            return self.odpovez_json(404, {"chyba": "Nenalezeno."})
        skutecna = soubor.relative_to(WEB).as_posix()
        povoleno = (skutecna.endswith(".html") and "/" not in skutecna) or skutecna in VEREJNE_SOUBORY or (
            skutecna.startswith(VEREJNE_SLOZKY)
        )
        if not povoleno:
            return self.odpovez_json(404, {"chyba": "Nenalezeno."})
        self.odpovez_souborem(soubor)

    def posli_data(self, relativni):
        soubor = (DATA / relativni).resolve()
        # Kontrolujeme skutečnou cestu – „skola/../nastaveni/…“ nesmí projít
        skutecna = soubor.relative_to(DATA).parts if soubor.is_relative_to(DATA) else ()
        if len(skutecna) < 2 or skutecna[0] not in DATOVE_SLOZKY or soubor.suffix != ".json":
            return self.odpovez_json(404, {"chyba": "Nenalezeno."})
        if not soubor.is_file():
            return self.odpovez_json(404, {"chyba": "Data zatím nejsou."})
        self.odpovez_souborem(soubor)

    def nacti_zapisy(self, nazev):
        cesta = cesta_zapisu(nazev)
        if not cesta:
            return self.odpovez_json(404, {"chyba": "Neznámé zápisy."})
        with ZAMEK:
            data, verze = precti_zapisy(cesta)
        self.odpovez_json(200, {"data": data, "verze": verze})

    # --- POST / PUT ---

    def do_POST(self):  # noqa: N802
        if not self.povoleny_host():
            return self.odpovez_json(403, {"chyba": "Nepovolená adresa."})
        cesta = posixpath.normpath(unquote(urlsplit(self.path).path))
        if cesta == "/api/prihlaseni":
            return self.prihlas()
        if cesta == "/api/odhlaseni":
            token = self.token()
            if token:
                zrus_relaci(token)
            return self.odpovez_json(200, {"ok": True}, [("Set-Cookie", f"{COOKIE}=; Path=/; Max-Age=0")])
        self.odpovez_json(404, {"chyba": "Nenalezeno."})

    def prihlas(self):
        # Po několika špatných pokusech čekáme čím dál déle (hádání hesla je pak k ničemu)
        if time.time() < neuspesne_pokusy["do"]:
            zbyva = int(neuspesne_pokusy["do"] - time.time()) + 1
            return self.odpovez_json(429, {"chyba": f"Moc pokusů. Zkus to za {zbyva} s."})
        if not HESLO.exists():
            return self.odpovez_json(503, {"chyba": "Heslo ještě není nastavené (server/nastav_heslo.py)."})
        try:
            heslo = str(self.precti_telo().get("heslo", ""))
        except ValueError:
            return self.odpovez_json(400, {"chyba": "Špatný požadavek."})
        if not over_heslo(heslo):
            neuspesne_pokusy["pocet"] += 1
            if neuspesne_pokusy["pocet"] >= 5:
                neuspesne_pokusy["do"] = time.time() + min(300, 10 * 2 ** (neuspesne_pokusy["pocet"] - 5))
            return self.odpovez_json(401, {"chyba": "Špatné heslo."})
        neuspesne_pokusy.update(pocet=0, do=0.0)
        token = nova_relace()
        # HttpOnly = JavaScript na stránce cookie nevidí; SameSite=Strict = cizí web ji nepošle
        cookie = f"{COOKIE}={token}; Path=/; Max-Age={PLATNOST_RELACE}; HttpOnly; SameSite=Strict"
        if self.headers.get("X-Forwarded-Proto") == "https" or (self.headers.get("Host") or "").endswith(".ts.net"):
            cookie += "; Secure"
        self.odpovez_json(200, {"ok": True}, [("Set-Cookie", cookie)])

    def do_PUT(self):  # noqa: N802
        if not self.povoleny_host():
            return self.odpovez_json(403, {"chyba": "Nepovolená adresa."})
        if not self.prihlaseny():
            return self.odpovez_json(401, {"chyba": "Nejsi přihlášený."})
        cesta = posixpath.normpath(unquote(urlsplit(self.path).path))
        if not cesta.startswith("/api/zapisy/"):
            return self.odpovez_json(404, {"chyba": "Nenalezeno."})
        soubor = cesta_zapisu(cesta.removeprefix("/api/zapisy/"))
        if not soubor:
            return self.odpovez_json(404, {"chyba": "Neznámé zápisy."})
        try:
            telo = self.precti_telo()
            data = telo["data"]
            if not isinstance(data, dict) or not isinstance(data.get("polozky"), dict):
                raise ValueError
        except (ValueError, KeyError):
            return self.odpovez_json(400, {"chyba": "Špatný formát zápisů."})

        with ZAMEK:
            aktualni, verze = precti_zapisy(soubor)
            # Jiné zařízení mezitím uložilo novější verzi → klient ji spojí se svou a zkusí znovu
            if telo.get("verze") != verze:
                return self.odpovez_json(409, {"data": aktualni, "verze": verze})
            uloz_json(soubor, data)
            nova = verze_textu(soubor.read_text(encoding="utf-8"))
        self.odpovez_json(200, {"verze": nova})


def main():
    server = ThreadingHTTPServer((ADRESA, PORT), Obsluha)
    print(f"Dashboard běží na http://localhost:{PORT} (data: {DATA})", flush=True)
    if not HESLO.exists():
        print("! Heslo není nastavené – spusť .venv/bin/python server/nastav_heslo.py", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
