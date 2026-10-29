import type { Datum } from "./types.ts";

// Alle Rechnungen in UTC, damit Sommerzeit und Zeitzone nichts verschieben.

export function zuDate(d: Datum): Date {
  const [j, m, t] = d.split("-").map(Number);
  return new Date(Date.UTC(j!, m! - 1, t!));
}

export function ausDate(d: Date): Datum {
  return d.toISOString().slice(0, 10);
}

export function heute(jetzt: Date = new Date()): Datum {
  // Kalendertag in Deutschland/Österreich, nicht in UTC
  const teile = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(jetzt);
  return teile;
}

export function plusTage(d: Datum, n: number): Datum {
  const x = zuDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return ausDate(x);
}

function tageImMonat(jahr: number, monat0: number): number {
  return new Date(Date.UTC(jahr, monat0 + 1, 0)).getUTCDate();
}

/** Monate addieren; der Tag bleibt am Anker (31. → letzter Tag im Februar → 31. im März). */
export function plusMonate(d: Datum, n: number, ankerTag?: number): Datum {
  const x = zuDate(d);
  const tag = ankerTag ?? x.getUTCDate();
  const ziel = x.getUTCMonth() + n;
  const jahr = x.getUTCFullYear() + Math.floor(ziel / 12);
  const monat0 = ((ziel % 12) + 12) % 12;
  const t = Math.min(tag, tageImMonat(jahr, monat0));
  return ausDate(new Date(Date.UTC(jahr, monat0, t)));
}

export function tageZwischen(von: Datum, bis: Datum): number {
  return Math.round((zuDate(bis).getTime() - zuDate(von).getTime()) / 86_400_000);
}

/** Samstag/Sonntag auf Montag schieben. Feiertage bleiben unberücksichtigt. */
export function naechsterWerktag(d: Datum): Datum {
  const wt = zuDate(d).getUTCDay();
  if (wt === 6) return plusTage(d, 2);
  if (wt === 0) return plusTage(d, 1);
  return d;
}

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function langesDatum(d: Datum): string {
  const x = zuDate(d);
  return `${WOCHENTAGE[x.getUTCDay()]}, ${x.getUTCDate()}. ${MONATE[x.getUTCMonth()]}`;
}

export function kurzesDatum(d: Datum): string {
  const [, m, t] = d.split("-");
  return `${Number(t)}.${Number(m)}.`;
}

export function monatsname(d: Datum, kurz = false): string {
  const n = MONATE[zuDate(d).getUTCMonth()]!;
  return kurz ? n.slice(0, 3) : n;
}

export function istDatum(s: string): s is Datum {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && ausDate(zuDate(s)) === s;
}
