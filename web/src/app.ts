// Gemeinsamer Zustand, Router und Hilfen für alle Seiten.
import { prognose, heute, type Prognose } from "@zentrale/core";
import type { Roh } from "./html.ts";
import type { Ansicht, Datenquelle } from "./daten/quelle.ts";

export interface Zustand {
  quelle: Datenquelle;
  ansicht: Ansicht | null;
  prognose: Prognose | null;
  fehler: string | null;
  /** Index der Freigabekarte auf der Startseite */
  karte: number;
  /** Gewähltes Konto im Geld-Puls (null = erstes liquides) */
  pulsKonto: string | null;
  /** Aktuelle Seite neu zeichnen (z. B. nach Live-Update) */
  neuZeichnen: () => void;
  /** Bestand neu laden und neu zeichnen */
  neuLaden: () => Promise<void>;
}

export interface Seite {
  /** HTML der Seite */
  rendern(z: Zustand, parameter: string[]): Roh | Promise<Roh>;
  /** Klicks auf Elemente mit data-tun="name". Rückgabe false = nicht neu zeichnen. */
  tun?: Record<string, (el: HTMLElement, z: Zustand, parameter: string[]) => void | false | Promise<void | false>>;
  /** Nach dem Einsetzen ins DOM (Ereignisse, Fokus); Rückgabe räumt beim Verlassen auf */
  danach?(wurzel: HTMLElement, z: Zustand, parameter: string[]): void | (() => void);
}

export function rechne(z: Zustand) {
  z.prognose = z.ansicht ? prognose(z.ansicht, { von: heute() }) : null;
}

export function gehe(ziel: string) {
  if (location.hash === ziel) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = ziel;
}

/** Kurze Rückmeldung über dem Orb */
export function hinweis(text: string) {
  const el = document.createElement("div");
  el.className = "glas band";
  el.setAttribute("role", "status");
  el.style.cssText = "position:fixed;left:16px;right:16px;bottom:calc(var(--unten) + 76px);z-index:9;text-align:center;max-width:488px;margin:0 auto;";
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
}

export function begruessung(): string {
  const stunde = Number(new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "numeric", hour12: false }).format(new Date()));
  return stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Guten Tag" : "Guten Abend";
}
