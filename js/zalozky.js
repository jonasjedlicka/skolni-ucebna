// SEZNAM ZÁLOŽEK – jediné místo, kde se určuje navigace dashboardu.
// Každá stránka si z něj navigaci vykreslí sama (viz vykresliNavigaci v spolecne.js).
//
// Nová záložka:
//   1. přidej sem řádek (id, název, stránka, ikona z IKONY níž),
//   2. zkopíruj některou stránku (např. zpravy.html) a v <body> nastav data-zalozka="<id>",
//   3. pokud má mít dlaždici na Přehledu, přidej modul do js/moduly/.
const ZALOZKY = [
  { id: "prehled", nazev: "Přehled", odkaz: "index.html", ikona: "prehled" },
  { id: "skola", nazev: "Škola", odkaz: "skola.html", ikona: "skola" },
  { id: "kalendar", nazev: "Kalendář", odkaz: "kalendar.html", ikona: "kalendar" },
  { id: "zpravy", nazev: "Zprávy", odkaz: "zpravy.html", ikona: "zpravy" },
  { id: "finance", nazev: "Finance", odkaz: "finance.html", ikona: "finance" },
];

// Ikony jako SVG cesty (obrysy, 24×24). Kreslí se barvou textu, takže jsou vždy šedé/bílé.
// "d" je popis čáry: M = přesuň pero, h/v = vodorovná/svislá čára, a = oblouk, z = uzavři.
const IKONY = {
  prehled: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  skola: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5M8 7h8",
  kalendar: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4",
  zpravy: "M4 5h13v15H6.5A2.5 2.5 0 0 1 4 17.5zM17 9h3v8.5a2.5 2.5 0 0 1-2.5 2.5M7.5 9h6M7.5 12.5h6M7.5 16h4",
  finance: "M4 20h16M6 16l4.5-4.5 3 3L19 9M15 9h4v4",
  zamek: "M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  zpet: "M15 5l-7 7 7 7",
};
