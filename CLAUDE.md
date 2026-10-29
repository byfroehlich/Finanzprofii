# Zentrale

Finanz-App fürs iPhone mit Engine auf dem Server und Claude Code im Abo. Überblick, Aufbau und Einrichtung in README.md.

- Prüfen vor Commit: `npm run check` (tsc für core/engine/web, vitest, vite build).
- Das Repo ist öffentlich: keine echten Namen, Beträge, Konten, Mailadressen oder Schlüssel ins Repo. Beispiele bleiben neutral.
- Beträge immer in Cent (ganze Zahlen), Datum als `JJJJ-MM-TT`. Rechenlogik gehört nach `core/` und bekommt Tests.
- Claude bekommt keine Shell. Neue Fähigkeiten als Werkzeug in `engine/src/werkzeuge.ts`; alles Verändernde nur als Vorschlag (`pruefeAktion` + Freigabe), Ausführung in `engine/src/aktionen.ts`.
- Kein Geld automatisch bewegen. Zahlungen werden vorbereitet, bestätigt wird in der Bank-App.
- Web-App ohne Framework und ohne schwere UI-Bibliotheken; Design „Nachtglas“ (Tokens in `web/src/stil.css`), Touch-Ziele ≥ 44 px, `prefers-reduced-motion` beachten, alle Texte deutsch.
- Schreibstil in der App: knapp, deutsch, ehrlich, ohne Schönfärberei.
