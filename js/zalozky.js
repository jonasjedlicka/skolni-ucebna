// SEZNAM ZÁLOŽEK – jediné místo, kde se určuje navigace dashboardu.
// Každá stránka si z něj navigaci vykreslí sama (viz vykresliNavigaci v spolecne.js).
//
// Nová záložka:
//   1. přidej sem řádek (id, název, stránka, ikona z IKONY níž),
//   2. zkopíruj některou stránku (např. kalendar.html) a v <body> nastav data-zalozka="<id>",
//   3. pokud má mít dlaždici na Přehledu, přidej modul do js/moduly/.
const ZALOZKY = [
  { id: "prehled", nazev: "Přehled", odkaz: "index.html", ikona: "prehled" },
  { id: "skola", nazev: "Škola", odkaz: "skola.html", ikona: "skola" },
  { id: "plan", nazev: "Plán", odkaz: "plan.html", ikona: "plan" },
  { id: "kalendar", nazev: "Kalendář", odkaz: "kalendar.html", ikona: "kalendar" },
  { id: "svet", nazev: "Svět", odkaz: "svet.html", ikona: "svet" },
];

// Ikony jako SVG cesty (obrysy, 24×24). Kreslí se barvou textu, takže jsou vždy šedé/bílé.
// "d" je popis čáry: M = přesuň pero, h/v = vodorovná/svislá čára, a = oblouk, z = uzavři.
const IKONY = {
  prehled: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  skola: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5M8 7h8",
  kalendar: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4",
  zpravy: "M4 5h13v15H6.5A2.5 2.5 0 0 1 4 17.5zM17 9h3v8.5a2.5 2.5 0 0 1-2.5 2.5M7.5 9h6M7.5 12.5h6M7.5 16h4",
  finance: "M4 20h16M6 16l4.5-4.5 3 3L19 9M15 9h4v4",
  plan: "M10 6h10M10 12h10M10 18h10M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17",
  svet: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  // Počasí
  jasno: "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  polojasno: "M8 3v1.5M3 8h1.5M4.5 4.5l1 1M11.5 4.5l-1 1M5.5 9.5a3 3 0 0 1 5-3M8 20h9a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7.6 13.1 3.5 3.5 0 0 0 8 20z",
  oblacno: "M7 19h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6.6 12.1 3.5 3.5 0 0 0 7 19z",
  mlha: "M4 8h16M4 12h16M6 16h12M8 20h8",
  dest: "M7 15h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6.6 8.1 3.5 3.5 0 0 0 7 15zM8.5 18l-1 3M12.5 18l-1 3M16.5 18l-1 3",
  snih: "M7 15h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6.6 8.1 3.5 3.5 0 0 0 7 15zM8 19h.01M12 21h.01M16 19h.01M10 21h.01M14 19h.01",
  bourka: "M7 14h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6.6 7.1 3.5 3.5 0 0 0 7 14zM12.5 15l-2.5 4h4l-2.5 4",
  // Soustředění
  spustit: "M8 5.5v13l10.5-6.5z",
  pauza: "M8.5 5v14M15.5 5v14",
  preskocit: "M6 6l9 6-9 6zM18 6v12",
  znovu: "M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5",
  zamek: "M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  zpet: "M15 5l-7 7 7 7",
};
