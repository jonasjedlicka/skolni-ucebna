"""
Vytvoří nový tajný token Jarvise.

Token je „heslo“ k tvému backendu (Cloudflare Workeru): bez něj backend
nikoho nepustí, takže ti nikdo cizí nemůže utrácet kredit za Claude API.

Co skript udělá:
  1. vygeneruje náhodný token,
  2. uloží ho ZAŠIFROVANĚ tvým heslem do data/jarvis/token.enc.json
     (dashboard si ho po odemknutí přečte sám),
  3. zkopíruje ho do schránky – ty ho pak vložíš do Cloudflare jako Secret
     JARVIS_TOKEN. Na obrazovku se nevypíše.

Spuštění:  .venv/bin/python stahovani/jarvis_token.py
Potom nahraj data/jarvis/token.enc.json na GitHub.
Nový token (např. když ten starý unikl) = spustit znovu a vložit do Cloudflare.
"""

import secrets
import subprocess

import sifrovani  # stahovani/sifrovani.py

CIL = sifrovani.PROJEKT / "data" / "jarvis" / "token.enc.json"

token = secrets.token_urlsafe(32)  # 32 náhodných bajtů – uhodnout se nedá
CIL.parent.mkdir(parents=True, exist_ok=True)
sifrovani.uloz_sifrovane(CIL, {"token": token})
subprocess.run(["pbcopy"], input=token, text=True, check=True)  # do schránky macOS

print("✓ Nový token Jarvise je zašifrovaný v data/jarvis/token.enc.json")
print("✓ A je ve schránce. Vlož ho do Cloudflare: Worker → Settings →")
print("  Variables and Secrets → JARVIS_TOKEN (typ Secret) → Cmd+V → Deploy.")
print("  Pak schránku přepiš něčím jiným, ať tam token nezůstane.")
