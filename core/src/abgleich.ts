import { plusTage, tageZwischen } from "./datum.ts";
import { termine } from "./prognose.ts";
import type { RohBuchung } from "./csv.ts";
import type { Cent, Datum, Planposten, Vertrag } from "./types.ts";

/** Nach einer passenden Buchung den nächsten Termin des Vertrags bestimmen. */
export function naechsterTerminNach(v: Vertrag, gebucht: Datum): Datum | null {
  // Eine Zahlung bis 10 Tage vor dem Termin zählt als dieser Termin (Banken buchen manchmal früher)
  if (tageZwischen(gebucht, v.naechsteFaelligkeit) > 10) return null;
  const weiter = termine({ ...v, werktag: false }, v.naechsteFaelligkeit, plusTage(v.naechsteFaelligkeit, 400));
  return weiter[0] ?? null;
}

/**
 * Geplanten Posten finden, den eine Buchung erledigt: Datum ±7 Tage, Betrag ±1 %
 * (geschätzte Posten wie Plattform-Auszahlungen ±20 %).
 */
export function passenderPlanposten(posten: Planposten[], b: { kontoId: string; datum: Datum; betrag: Cent }): Planposten | null {
  const toleranz = (p: Planposten) => Math.max(100, Math.abs(p.betrag) * (p.sicherheit === "sicher" ? 0.01 : 0.2));
  return posten
    .filter((p) => p.status === "geplant" && p.kontoId === b.kontoId && Math.sign(p.betrag) === Math.sign(b.betrag))
    .filter((p) => Math.abs(p.betrag - b.betrag) <= toleranz(p) && Math.abs(tageZwischen(p.datum, b.datum)) <= 7)
    .sort((x, y) => Math.abs(tageZwischen(x.datum, b.datum)) - Math.abs(tageZwischen(y.datum, b.datum)))[0] ?? null;
}

/** Aktuellen Kontostand aus einem Export lesen (Spalte „Saldo nach Buchung“). */
export function saldoAusExport(liste: RohBuchung[]): { saldo: Cent; datum: Datum } | null {
  const mitSaldo = liste.filter((b) => b.saldoNach !== null);
  if (!mitSaldo.length) return null;
  const neuestes = mitSaldo.reduce((m, b) => (b.datum > m ? b.datum : m), mitSaldo[0]!.datum);
  const amTag = mitSaldo.filter((b) => b.datum === neuestes);
  // Neueste zuerst sortierte Exporte: erste Zeile des Tages ist die letzte Buchung, sonst umgekehrt
  const absteigend = liste[0]!.datum >= liste[liste.length - 1]!.datum;
  const letzte = absteigend ? amTag[0]! : amTag[amTag.length - 1]!;
  return { saldo: letzte.saldoNach!, datum: neuestes };
}
