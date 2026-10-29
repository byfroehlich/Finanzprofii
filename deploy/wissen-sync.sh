#!/usr/bin/env bash
# Läuft auf dem Mac: spiegelt Wissensregister, Regeln und CLAUDE.md aus iCloud auf den Server,
# damit Claude dort dieselben Fakten kennt. Nur Lesen auf dem Server, Quelle bleibt iCloud.
# Als launchd-Job alle 15 Minuten (siehe README).
set -euo pipefail
: "${ZIEL:?ZIEL=zentrale@HOST setzen}"
QUELLE="$HOME/Library/Mobile Documents/com~apple~CloudDocs/3_PRIVAT/Steuer"
rsync -az --delete \
  --include "CLAUDE.md" --include "REGELN.md" --include "_Wissen/***" \
  --exclude "*" \
  "$QUELLE/" "$ZIEL:/srv/zentrale/wissen/"
