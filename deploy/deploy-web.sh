#!/usr/bin/env bash
# Baut die Web-App und kopiert sie auf den Server.
# Aufruf: ZIEL=zentrale@HOST ./deploy/deploy-web.sh   (web/.env.production mit Supabase-URL und Anon-Key)
set -euo pipefail
cd "$(dirname "$0")/.."
: "${ZIEL:?ZIEL=benutzer@server setzen}"
npm run check
rsync -az --delete web/dist/ "$ZIEL:/srv/zentrale/web/"
echo "Web-App ist oben."
