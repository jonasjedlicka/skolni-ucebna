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

// Datum známky jako "2026-10-20". Edookit píše „Út 20. 10. 2026“,
// u čerstvých známek ale jen „Dnes“ nebo „Včera“.
function datumZnamky(texty) {
  const kDatu = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  for (const t of texty) {
    const m = t.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    const posun = { Dnes: 0, Včera: 1, Předevčírem: 2 }[t];
    if (posun !== undefined) {
      const d = new Date();
      d.setDate(d.getDate() - posun);
      return kDatu(d);
    }
  }
  return null;
}

// Stránka /evaluation/listing – všechny známky letošního roku.
// Hodnota je buď známka („4“, „2-“), nebo procenta („75 %“) – u nich Edookit
// v závorce ukazuje, na jakou známku je převedl („(2)“). Váha je v popisku.
function prectiZnamky() {
  const znamky = [];
  for (const radek of document.querySelectorAll("ul.table_row:not(.gridLabel)")) {
    const id = (radek.getAttribute("onclick") || "").match(/evaluationId=(\d+)/);
    const kurz = text(radek.querySelector(".c1 .link_info")); // "Aj 1 - 3.D"
    const nadpis = [...radek.querySelectorAll(".c1 strong p")].map(text); // ["Písemná práce", "Test - buřiči"]
    const hodnoceni = radek.querySelector(".c2 .evaluation [title]");
    const datum = datumZnamky([...radek.querySelectorAll(".c3 p")].map(text));
    if (!id || !datum) continue;
    znamky.push({
      id: id[1],
      zkratka: kurz.split(" - ")[0].replace(/\s+\d+$/, ""), // "Aj 1" → "Aj"
      druh: nadpis[0] || "",
      tema: nadpis[1] || "",
      hodnota: text(hodnoceni), // "4", "2-", "75 %", "N"…
      prevedeno: text(radek.querySelector(".c2 .convertedEvaluation")).replace(/[()]/g, ""), // "2"
      vaha: (hodnoceni?.getAttribute("title") || "").replace(/^Váha:\s*/, ""), // "1.5"
      datum,
    });
  }
  return znamky;
}
