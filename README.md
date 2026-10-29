# Zentrale

Finanz-Fernbedienung fürs iPhone: Kontostände, 6-Monats-Prognose, jede Buchung in einem Satz erklärt, „Kann ich mir das leisten?“, Freigaben und Claude-Aufträge per Sprache oder Text. Basis ist Claude Code im Abo.

**Grundprinzip:** Claude schlägt vor, Mathias bestätigt mit einem Tipp, die Zentrale führt aus. Geld wird nie automatisch bewegt; Überweisungen werden vorbereitet und in der Bank-App bestätigt.

> Das Repo ist öffentlich. Hier liegen nur Code und neutrale Beispiele. Echte Zahlen, Namen und Zugangsdaten gehören in Supabase bzw. in Dateien auf dem Server, nie ins Repo.

## Aufbau

```
iPhone: Web-App (web/)          ← liest live aus Supabase, Anmeldung per Code aus der Mail
Supabase (supabase/)            ← Konten, Buchungen, Verträge, Plan, Fristen, Freigaben, Aufträge, Töpfe
Hetzner: Engine (engine/)       ← immer an
  ├─ Abrufer: deutsche Banken (FinTS), Qonto (API), Smoobu (API), CSV-Import
  ├─ Claude Code (Abo), nur mit den Zentrale-Werkzeugen (MCP), ohne Shell
  ├─ führt Freigaben aus, schickt Push, warnt, sichert nachts
Mac mini (folgt)                ← Portale ohne Schnittstelle, WhatsApp, Notfall-Bildschirm
core/                           ← gemeinsame Rechenlogik (Prognose, Import, Einordnung), getestet
```

| Ordner | Inhalt |
|---|---|
| `core/` | Datenmodell, Prognose je Konto und gesamt, „leisten“, CSV-Import (VR/Atruvia, Revolut, ELBA, allgemein), Einordnung über Verträge und Regeln, Erkennung wiederkehrender Zahlungen, Warnungen, Prüfung von Aktionen |
| `engine/` | Dienst für den Server: `main.ts` (Takt), `claude.ts` (Aufträge), `mcp.ts` + `werkzeuge.ts` (Claudes Werkzeuge), `aktionen.ts` (Ausführen nach Freigabe), `abrufer/` (FinTS, Qonto, Smoobu), `cli.ts` (`zentrale` für Einrichtung) |
| `web/` | iPhone-App im Design „Nachtglas“, ohne Framework (TypeScript + Vite). Ohne Supabase-Werte läuft sie mit Beispieldaten |
| `supabase/` | Schema mit Zeilenschutz (RLS) |
| `deploy/` | systemd-Dienst, Caddy, Deploy- und Wissen-Sync-Skript |

## Stand

| Teil | Stand |
|---|---|
| Prognose, Import, Einordnung, Warnungen (`core`) | fertig, 54 Tests |
| Datenbankschema + Zugriffsschutz | fertig, gegen Postgres 16 geprüft (fremde Nutzer sehen nichts, App kann Aktionen nicht verändern) |
| Claude-Aufträge | fertig, mit echter Claude-CLI geprüft: nur Zentrale-Werkzeuge, kein Bash, Dateien nur im Wissensordner |
| Web-App: Start, Konten, Konto, Claude, Wünsche, Offen, Vermietung, Steuerung, Anmelden | fertig, im iPhone-Format geprüft, ab 360 px ohne seitliches Scrollen |
| Push, Freigaben ausführen, Mail (SMTP), Sicherung | geschrieben, braucht Server zum Test |
| Abrufer FinTS, Qonto, Smoobu | geschrieben, **ungetestet** bis Zugangsdaten da sind |
| Banken ohne FinTS, PayPal | vorerst CSV-Import; Kontodienst (PSD2) oder Browser über den Mac mini später |
| Mac mini: Portale, WhatsApp, Bildschirm | folgt mit dem Gerät |

### Sicherheitsbefund aus dem Test

`--allowedTools "Bash(zentrale:*)"` ließ sich mit `zentrale stand; id` umgehen: Der zweite Befehl lief. Deshalb bekommt Claude **keine Shell**, sondern nur die Werkzeuge eines eigenen MCP-Servers (`engine/src/mcp.ts`), dazu `--restricted`, `--strict-mcp-config` und `--permission-mode dontAsk`. Schreiben kann Claude nur zwei Dinge: Buchungen erklären und Vorschläge anlegen. Ausgeführt wird erst nach der Freigabe in der App, und auch dann wird jede Aktion noch einmal geprüft (`pruefeAktion`).

## Einrichtung

### 1. Supabase
1. Projekt anlegen, Region Frankfurt.
2. SQL-Editor: `supabase/migrations/0001_zentrale.sql` ausführen.
3. Authentication › Users: Mathias anlegen (E-Mail). Danach **Sign-ups abschalten**.
4. Authentication › E-Mail-Vorlage „Magic Link“: `{{ .Token }}` einfügen, damit ein Code statt nur eines Links kommt. Ein Link würde Safari öffnen, nicht die App.
5. Notieren: Projekt-URL, `anon`-Schlüssel (für die App), `service_role`-Schlüssel (nur Server), Nutzer-ID.

### 2. Hetzner
```bash
adduser --disabled-password zentrale
mkdir -p /srv/zentrale/{app,web,wissen,geheim,sicherung} && chown -R zentrale: /srv/zentrale && chmod 700 /srv/zentrale/geheim
# Node 22, git, rsync, python3-venv, caddy installieren
sudo -u zentrale git clone https://github.com/byfroehlich/Finanzprofii /srv/zentrale/app
cd /srv/zentrale/app && sudo -u zentrale npm ci --legacy-peer-deps
sudo -u zentrale cp engine/.env.example engine/.env   # ausfüllen, chmod 600
npm install -g @anthropic-ai/claude-code && sudo -u zentrale claude   # einmal mit dem Abo anmelden, dann beenden
cp deploy/zentrale-engine.service /etc/systemd/system/ && systemctl enable --now zentrale-engine
```
Caddy: `deploy/Caddyfile` anpassen (Host), sichern, `caddy validate`, `systemctl reload caddy`.

### 3. Startbestand
1. `docs/startdaten.beispiel.json` als Vorlage nehmen, echte Konten, Verträge, offene Posten, Fristen und Töpfe eintragen und als `/srv/zentrale/geheim/startdaten.json` speichern.
2. `zentrale einspielen /srv/zentrale/geheim/startdaten.json`
3. Kontoauszüge: `zentrale import KONTO-ID auszug.csv` je Konto. Doppelte Buchungen werden erkannt, der Kontostand wird aus „Saldo nach Buchung“ übernommen.
4. `zentrale stand` zeigt, ob alles plausibel ist. Unklare Buchungen erklärt Claude in der nächsten Runde.

`zentrale` ist `node engine/bin/zentrale.mjs`, z. B. per `npm link -w engine`.

### 4. Web-App
`web/.env.production` mit `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`, dann `ZIEL=zentrale@HOST ./deploy/deploy-web.sh`.
Am iPhone: Adresse in Safari öffnen › Teilen › Zum Home-Bildschirm › dort anmelden (Code aus der Mail) › Steuerung › Mitteilungen einschalten.

### 5. Abrufer
- **Bank per FinTS:** Für FinTS braucht es eine kostenlose Produkt-Registrierung bei der Deutschen Kreditwirtschaft (hbci-zka.de, Bearbeitung dauert etwas). Dann `python3 -m venv /srv/zentrale/fints && /srv/zentrale/fints/bin/pip install -r engine/fints/requirements.txt`, `FINTS_PYTHON=/srv/zentrale/fints/bin/python3`, Konfiguration nach Kopf von `engine/fints/abruf.py` und einmal `abruf.py CONFIG --einrichten` im Terminal (App-Freigabe als TAN-Verfahren wählen). Danach läuft der Abruf alle 6 Stunden. Will die Bank eine Bestätigung, kommt ein Push und die Freigabe in der Banking-App reicht.
- **Qonto:** API-Schlüssel (Login + Secret) in `engine/.env`.
- **Smoobu:** API-Schlüssel, Konto der Auszahlungen (`SMOOBU_KONTO_ID`). Anteile nach Provision (`SMOOBU_ANTEIL_AIRBNB`, `SMOOBU_ANTEIL_BOOKING`) an echte Auszahlungen anpassen, `SMOOBU_BOOKING_ANKER` = ein bekannter Booking-Auszahlungsfreitag.

### 6. Wissen vom Mac
`deploy/wissen-sync.sh` spiegelt `CLAUDE.md`, `REGELN.md` und `_Wissen/` aus iCloud nach `/srv/zentrale/wissen` (dort arbeitet Claude). Als launchd-Job alle 15 Minuten, solange der Mac an ist; mit dem Mac mini dauerhaft.

## Entwickeln

```bash
npm install --legacy-peer-deps   # npm 10 stolpert sonst über optionale Peer-Abhängigkeiten von vitest
npm run check                    # Typprüfung, Tests, Build
npm run dev -w web               # App mit Beispieldaten auf http://localhost:5173
```
