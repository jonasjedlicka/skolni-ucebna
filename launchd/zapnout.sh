#!/bin/bash
# Zapne (nebo po změně znovu načte) automatické úlohy dashboardu v macOS.
#   launchd/zapnout.sh
# Každý soubor launchd/cz.dashboard.*.plist zkopíruje do ~/Library/LaunchAgents
# (s dosazenými cestami) a spustí ho. Vypnutí všeho: launchd/vypnout.sh
set -euo pipefail

PROJEKT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${DASHBOARD_DATA:-$HOME/Dashboard-data}"
CIL="$HOME/Library/LaunchAgents"
UZIVATEL="gui/$(id -u)"
mkdir -p "$CIL" "$DATA/logy"

# Stará úloha z doby GitHub Pages (stahování + nahrávání na GitHub) – už ji nechceme
if launchctl print "$UZIVATEL/cz.ucebna.stahovani" >/dev/null 2>&1; then
  launchctl bootout "$UZIVATEL/cz.ucebna.stahovani" || true
fi
rm -f "$CIL/cz.ucebna.stahovani.plist"

for vzor in "$PROJEKT"/launchd/cz.dashboard.*.plist; do
  nazev="$(basename "$vzor" .plist)"
  sed -e "s|__PROJEKT__|$PROJEKT|g" -e "s|__DATA__|$DATA|g" "$vzor" > "$CIL/$nazev.plist"
  # Když už běží, nejdřív ho vypnout, ať se načte nová verze
  launchctl bootout "$UZIVATEL/$nazev" 2>/dev/null || true
  launchctl bootstrap "$UZIVATEL" "$CIL/$nazev.plist"
  echo "✓ $nazev"
done
