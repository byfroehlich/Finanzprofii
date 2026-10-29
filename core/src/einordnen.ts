import { euro } from "./geld.ts";
import { RHYTHMEN } from "./types.ts";
import type { Bereich, Buchung, Cent, Vertrag } from "./types.ts";

/** Feste Regel: bekannte Buchungen ohne Claude einordnen. */
export interface Regel {
  id: string;
  /** Alle Muster müssen vorkommen (Kleinbuchstaben, in Gegenpartei oder Zweck). */
  muster: string[];
  richtung: "ein" | "aus" | "beide";
  bereich: Bereich;
  kategorie: string;
  /** Platzhalter: {gegenpartei}, {betrag} */
  erklaerung: string;
  prioritaet: number;
}

export interface Einordnung {
  bereich: Bereich;
  kategorie: string;
  erklaerung: string;
  vertragId: string | null;
  quelle: "vertrag" | "regel";
}

type Eingabe = Pick<Buchung, "betrag" | "gegenpartei" | "zweck" | "kontoId">;

function text(b: Eingabe): string {
  return `${b.gegenpartei} ${b.zweck}`.toLowerCase().replace(/\s+/g, " ");
}

function passt(muster: string[], t: string): boolean {
  return muster.length > 0 && muster.every((m) => t.includes(m.toLowerCase()));
}

/** Zuerst Verträge (wiederkehrende Zahlungen), dann Regeln. Null = Claude fragen. */
export function einordnen(b: Eingabe, vertraege: Vertrag[], regeln: Regel[]): Einordnung | null {
  const t = text(b);
  const vertrag = vertraege
    .filter((v) => v.aktiv && v.kontoId === b.kontoId && Math.sign(v.betrag) === Math.sign(b.betrag) && passt(v.muster, t))
    .sort((x, y) => Math.abs(x.betrag - b.betrag) - Math.abs(y.betrag - b.betrag))[0];
  if (vertrag) {
    return {
      bereich: vertrag.bereich,
      kategorie: vertrag.art,
      erklaerung: vertragsErklaerung(vertrag, b.betrag),
      vertragId: vertrag.id,
      quelle: "vertrag",
    };
  }
  const regel = regeln
    .filter((r) => (r.richtung === "beide" || (r.richtung === "ein") === b.betrag > 0) && passt(r.muster, t))
    .sort((x, y) => y.prioritaet - x.prioritaet)[0];
  if (regel) {
    return {
      bereich: regel.bereich,
      kategorie: regel.kategorie,
      erklaerung: regel.erklaerung
        .replace("{gegenpartei}", b.gegenpartei || "unbekannt")
        .replace("{betrag}", euro(Math.abs(b.betrag))),
      vertragId: null,
      quelle: "regel",
    };
  }
  return null;
}

export function vertragsErklaerung(v: Vertrag, betrag: Cent): string {
  const richtung = v.betrag > 0 ? "Eingang" : "Zahlung";
  const basis = `${richtung} ${v.name} (${RHYTHMEN[v.rhythmus]})`;
  const diff = Math.abs(betrag) - Math.abs(v.betrag);
  if (Math.abs(diff) <= Math.max(100, Math.abs(v.betrag) * 0.02)) return `${basis}, wie erwartet.`;
  return diff > 0
    ? `${basis}, ${euro(diff)} mehr als üblich.`
    : `${basis}, ${euro(-diff)} weniger als üblich.`;
}
