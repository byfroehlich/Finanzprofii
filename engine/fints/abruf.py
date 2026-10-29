#!/usr/bin/env python3
"""FinTS-Abruf (Volksbanken, Sparkassen u. a.): Kontostand und Umsätze als JSON auf stdout.

Aufruf:
  abruf.py CONFIG.json --einrichten   einmalig im Terminal: TAN-Verfahren wählen, Konten anzeigen
  abruf.py CONFIG.json [--tage 30]    Abruf für die Engine

CONFIG.json (chmod 600, nie ins Repo):
  {"blz": "…", "login": "…", "pin_datei": "/srv/zentrale/geheim/bank.pin",
   "server": "https://…/cgi-bin/hbciservlet", "product_id": "…",
   "zustand": "/srv/zentrale/geheim/fints.zustand", "konten": {"DE…IBAN": "konto-id-in-der-zentrale"}}

Während die Bank eine Bestätigung in der Banking-App erwartet, schreibt das Skript
eine Zeile {"ereignis": "bestaetigen", …} und wartet bis zu 5 Minuten.
"""
import datetime as dt
import json
import os
import sys
import time

from fints.client import FinTS3PinTanClient, NeedTANResponse
from fints.utils import minimal_interactive_cli_bootstrap


def melde(o):
    print(json.dumps(o, ensure_ascii=False), flush=True)


def lade(pfad):
    with open(pfad, encoding="utf-8") as f:
        return json.load(f)


def warte_auf_freigabe(client, antwort, wartezeit=300):
    """Entkoppelte Freigabe (App) abwarten; klassische TAN-Eingabe geht nur beim Einrichten."""
    if not isinstance(antwort, NeedTANResponse):
        return antwort
    if not antwort.decoupled:
        raise RuntimeError("Die Bank verlangt eine TAN-Eingabe. Bitte `abruf.py CONFIG --einrichten` im Terminal ausführen.")
    melde({"ereignis": "bestaetigen", "text": str(antwort.challenge or "Bitte in der Banking-App bestätigen.")})
    ende = time.time() + wartezeit
    while isinstance(antwort, NeedTANResponse) and time.time() < ende:
        time.sleep(4)
        antwort = client.send_tan(antwort, "")
    if isinstance(antwort, NeedTANResponse):
        raise RuntimeError("Keine Bestätigung in der Banking-App innerhalb von 5 Minuten.")
    return antwort


def cent(betrag):
    return int(round(betrag * 100))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    cfg = lade(sys.argv[1])
    einrichten = "--einrichten" in sys.argv
    tage = int(sys.argv[sys.argv.index("--tage") + 1]) if "--tage" in sys.argv else 30
    with open(cfg["pin_datei"], encoding="utf-8") as f:
        pin = f.read().strip()
    zustand = None
    if os.path.exists(cfg["zustand"]):
        with open(cfg["zustand"], "rb") as f:
            zustand = f.read()

    client = FinTS3PinTanClient(cfg["blz"], cfg["login"], pin, cfg["server"], product_id=cfg["product_id"], from_data=zustand)
    if einrichten:
        minimal_interactive_cli_bootstrap(client)

    ergebnis = []
    with client:
        if client.init_tan_response:
            if einrichten and not client.init_tan_response.decoupled:
                print(client.init_tan_response.challenge)
                client.send_tan(client.init_tan_response, input("TAN: "))
            else:
                warte_auf_freigabe(client, client.init_tan_response)

        konten = warte_auf_freigabe(client, client.get_sepa_accounts())
        zuordnung = cfg.get("konten", {})
        if einrichten:
            for k in konten:
                print(f"{k.iban}  →  {zuordnung.get(k.iban, '(noch keiner Zentrale-Konto-ID zugeordnet)')}")

        start = dt.date.today() - dt.timedelta(days=tage)
        for k in konten:
            konto_id = zuordnung.get(k.iban)
            if not konto_id:
                continue
            saldo = warte_auf_freigabe(client, client.get_balance(k))
            umsaetze = warte_auf_freigabe(client, client.get_transactions(k, start, dt.date.today()))
            buchungen = []
            for u in umsaetze or []:
                d = u.data
                datum = d.get("date") or d.get("entry_date")
                betrag = d["amount"].amount
                buchungen.append({
                    "datum": datum.isoformat(),
                    "betrag": cent(betrag),
                    "gegenpartei": (d.get("applicant_name") or "").strip(),
                    "zweck": " ".join(x for x in [d.get("posting_text"), d.get("purpose")] if x).strip(),
                })
            ergebnis.append({
                "kontoId": konto_id,
                "saldo": cent(saldo.amount.amount),
                "saldoDatum": saldo.date.isoformat(),
                "buchungen": buchungen,
            })

    # Zustand sichern, damit nicht bei jedem Abruf eine Freigabe nötig ist
    neu = client.deconstruct(including_private=True)
    fd = os.open(cfg["zustand"], os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(neu)
    melde({"ereignis": "fertig", "konten": ergebnis})


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001 – Fehler gehen als JSON an die Engine
        melde({"ereignis": "fehler", "text": str(e)})
        sys.exit(1)
