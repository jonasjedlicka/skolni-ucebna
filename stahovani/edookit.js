// Funkce, které skript stahni.py spouští přímo ve stránkách Edookitu.
// Každá přečte data z jedné stránky a vrátí je jako obyčejný objekt,
// který si pak Python převezme.

// Vrátí text prvku bez zbytečných mezer a zalomení.
function text(prvek) {
  return prvek ? prvek.textContent.replace(/\s+/g, " ").trim() : "";
}

// Stránka /timetable/ – jeden týden rozvrhu.
function prectiTyden() {
  // Časy hodin z hlavičky tabulky, např. "1. 08:00– 08:45"
  const casy = [...document.querySelectorAll(".period-time")]
    .map((prvek) => {
      const m = text(prvek).match(/^(\d+)\.\s*(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/);
      return m && { hodina: Number(m[1]), od: m[2], do: m[3] };
    })
    .filter(Boolean);

  const hodiny = [];
  for (const lekce of document.querySelectorAll("a.lesson")) {
    const datum = lekce.querySelector("[data-day]")?.dataset.day; // "2026_10_19"
    const radky = lekce.querySelectorAll(".lessonRow"); // zkratka, učitel, učebna
    if (!datum || radky.length < 3) continue;

    // Zrušená hodina má přeškrtnutý název (<s>) a nápis „Zrušeno“
    if (lekce.querySelector("s") || /Zrušeno/.test(text(radky[0]))) continue;

    // Každá hodina má skrytý popis, např.
    // "Dě (Dějepis) Hr (Horáková P.) 3.D Po 19. 10. 08:00–08:45".
    // Podle času začátku poznáme, kolikátá je to hodina.
    const popis = text(document.getElementById(lekce.dataset.hash + "longDesc" + lekce.dataset.j));
    const cas = popis.match(/(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/);
    const hodina = cas && casy.find((c) => c.od === cas[1]);
    if (!hodina) continue; // např. oběd, který nezačíná se začátkem hodiny

    hodiny.push({
      datum: datum.replaceAll("_", "-"), // "2026-10-19"
      hodina: hodina.hodina,
      zkratka: text(radky[0]),
      ucebna: text(radky[2]),
    });
  }
  return { casy, hodiny };
}

// Stránka /exams/ – nadcházející i nedávné písemky.
// Které už proběhly, odfiltruje až Python podle data.
function prectiPisemky() {
  const pisemky = [];
  for (const radek of document.querySelectorAll("ul.table_row:not(.gridLabel)")) {
    const termin = radek.querySelector(".c1");
    // "2. 11., od 11:50 do 12:35" – rok tam není, ten doplní Python
    const datum = text(termin?.querySelector("b")).match(/(\d{1,2})\.\s*(\d{1,2})\./);
    if (!datum) continue; // např. termín „neomezeno“

    const kurz = text(termin.querySelector(".link_info")); // "Che - 3.D" nebo "Aj 1 - 3.D"
    const odstavce = [...termin.querySelectorAll("p")].map(text);
    pisemky.push({
      den: Number(datum[1]),
      mesic: Number(datum[2]),
      od: text(termin.querySelector(".date_time")) || null, // "8:55"
      zkratka: kurz.split(" - ")[0].replace(/\s+\d+$/, ""), // "Aj 1" → "Aj"
      typ: odstavce[2] || null, // "Malá písemka"
      tema: text(radek.querySelector(".c2 .bold")),
    });
  }
  return pisemky;
}

// Stránka /courses/ – u každého předmětu řádek „Učivo“.
function prectiUcivo() {
  const vysledek = [];
  for (const box of document.querySelectorAll(".box.decor_box")) {
    const nadpis = text(box.querySelector("h2")); // "Matematika Ma - 3.D 2026/27"
    const m = nadpis.match(/(\S+)(?:\s+\d+)?\s+-\s+\S/);
    if (!m) continue;

    // Tabulka „Učitel: …, Známky: …, Učivo: …“ → objekt { Učitel: "…", Učivo: "…" }
    const radky = {};
    for (const tr of box.querySelectorAll("tr")) {
      const bunky = tr.querySelectorAll("td");
      if (bunky.length === 2) radky[text(bunky[0]).replace(/:$/, "")] = text(bunky[1]);
    }
    vysledek.push({
      zkratka: m[1],
      neaktivni: nadpis.includes("Neaktivní"),
      ucivo: radky["Učivo"] || "",
    });
  }
  return vysledek;
}
