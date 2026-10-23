#!/bin/bash
# Vypne všechny automatické úlohy dashboardu (server, stahování…).
set -uo pipefail
for soubor in "$HOME"/Library/LaunchAgents/cz.dashboard.*.plist; do
  [ -e "$soubor" ] || continue
  nazev="$(basename "$soubor" .plist)"
  launchctl bootout "gui/$(id -u)/$nazev" 2>/dev/null
  rm -f "$soubor"
  echo "✓ vypnuto: $nazev"
done
