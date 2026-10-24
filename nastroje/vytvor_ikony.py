"""
Nakreslí ikony aplikace (PWA) do složky ikony/ – ve stylu dashboardu:
tmavé pozadí se světlou skvrnou, skleněná destička a bílý symbol
Přehledu (čtyři dlaždice, jedna plná). Jen černá, bílá a šedá.

  .venv/bin/python nastroje/vytvor_ikony.py

Potřebuje knihovnu Pillow (.venv/bin/pip install pillow).
Kreslí se ve velkém rozlišení a pak zmenšuje – hrany jsou pak hladké.
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

IKONY = Path(__file__).resolve().parent.parent / "ikony"
VELKA = 2048  # kreslicí plátno

# Výsledné soubory: (název, velikost, „maskable“ = víc místa okolo pro Android)
VYSTUPY = [
    ("apple-touch-icon.png", 180, False),  # ikona na ploše iPhonu
    ("ikona-192.png", 192, False),
    ("ikona-512.png", 512, False),
    ("ikona-maskable-512.png", 512, True),
    ("favicon-32.png", 32, False),  # záložka prohlížeče
]


def pozadi(s):
    """Tmavý šikmý přechod jako pozadí stránky + měkká světlá skvrna vlevo nahoře."""
    # Přechod 0–255 po úhlopříčce = průměr svislého a vodorovného přechodu,
    # pak přebarvit na #2a2a2e (vlevo nahoře) … #050506 (vpravo dole)
    svisly = Image.linear_gradient("L").resize((s, s))
    prechod = ImageChops.add(svisly, svisly.rotate(90), scale=2.0)
    svetle, tmave = (42, 42, 46), (5, 5, 6)
    obrazek = Image.merge("RGB", [prechod.point(lambda v, a=a, b=b: a + (b - a) * v // 255) for a, b in zip(svetle, tmave)])
    # Skvrna: rozmazaná bílá elipsa s nízkou průhledností
    skvrna = Image.new("L", (s, s), 0)
    ImageDraw.Draw(skvrna).ellipse((int(-0.15 * s), int(-0.2 * s), int(0.65 * s), int(0.5 * s)), fill=70)
    skvrna = skvrna.filter(ImageFilter.GaussianBlur(s * 0.12))
    return Image.composite(Image.new("RGB", (s, s), (255, 255, 255)), obrazek, skvrna)


def sklo(obrazek, box, polomer):
    """Skleněná destička: průsvitná bílá výplň, světlejší horní odlesk a jemný okraj."""
    s = obrazek.width
    vrstva = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    maska = Image.new("L", (s, s), 0)
    ImageDraw.Draw(maska).rounded_rectangle(box, polomer, fill=255)

    # Výplň 9 % bílé
    vyplne = Image.new("RGBA", (s, s), (255, 255, 255, 23))
    vrstva = Image.composite(vyplne, vrstva, maska)

    # Odlesk: přechod průhlednosti shora dolů, jen v horních ~45 % destičky
    vyska = box[3] - box[1]
    odlesk = Image.linear_gradient("L").resize((s, vyska)).point(lambda v: max(0, 40 - v * 40 // 115))
    odlesk_plny = Image.new("L", (s, s), 0)
    odlesk_plny.paste(odlesk, (0, box[1]))
    odlesk_plny = ImageChops.multiply(odlesk_plny, maska)
    vrstva = Image.alpha_composite(vrstva, Image.merge("RGBA", [Image.new("L", (s, s), 255)] * 3 + [odlesk_plny]))

    # Okraj destičky
    ImageDraw.Draw(vrstva).rounded_rectangle(box, polomer, outline=(255, 255, 255, 80), width=max(2, s // 160))
    # Jemný stín pod destičkou (aby „plavala“)
    stin = Image.new("L", (s, s), 0)
    ImageDraw.Draw(stin).rounded_rectangle((box[0], box[1] + s // 40, box[2], box[3] + s // 40), polomer, fill=110)
    stin = stin.filter(ImageFilter.GaussianBlur(s * 0.03))
    zaklad = Image.composite(Image.new("RGB", (s, s), (0, 0, 0)), obrazek, stin)
    return Image.alpha_composite(zaklad.convert("RGBA"), vrstva)


def symbol(obrazek, box):
    """Čtyři zaoblené dlaždice 2×2 (symbol Přehledu): tři obrysem, pravá horní plná."""
    kresba = ImageDraw.Draw(obrazek)
    x0, y0, x1, y1 = box
    mezera = (x1 - x0) * 0.14
    strana = ((x1 - x0) - mezera) / 2
    tloustka = max(2, int((x1 - x0) * 0.055))
    polomer = strana * 0.24
    for radek in range(2):
        for sloupec in range(2):
            lx = x0 + sloupec * (strana + mezera)
            ly = y0 + radek * (strana + mezera)
            ctverec = (int(lx), int(ly), int(lx + strana), int(ly + strana))
            if (radek, sloupec) == (0, 1):
                kresba.rounded_rectangle(ctverec, polomer, fill=(255, 255, 255, 255))
            else:
                kresba.rounded_rectangle(ctverec, polomer, outline=(245, 245, 247, 255), width=tloustka)
    return obrazek


def nakresli(maskable):
    s = VELKA
    obrazek = pozadi(s)
    # Maskable (Android) ořízne až do kruhu → destička i symbol musí být menší
    velikost_desky = 0.58 if maskable else 0.66
    okraj = int(s * (1 - velikost_desky) / 2)
    deska = (okraj, okraj, s - okraj, s - okraj)
    obrazek = sklo(obrazek, deska, int((deska[2] - deska[0]) * 0.24))
    vnitrni = int((deska[2] - deska[0]) * 0.22)
    obrazek = symbol(obrazek, (deska[0] + vnitrni, deska[1] + vnitrni, deska[2] - vnitrni, deska[3] - vnitrni))
    return obrazek.convert("RGB")  # bez průhlednosti – iPhone by ji vyplnil černou


def main():
    IKONY.mkdir(exist_ok=True)
    predlohy = {False: nakresli(False), True: nakresli(True)}
    for nazev, velikost, maskable in VYSTUPY:
        predlohy[maskable].resize((velikost, velikost), Image.LANCZOS).save(IKONY / nazev, optimize=True)
        print(f"✓ ikony/{nazev} ({velikost}×{velikost})")


if __name__ == "__main__":
    main()
