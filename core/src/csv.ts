import { parseBetrag } from "./geld.ts";
import { istDatum } from "./datum.ts";
import type { Cent, Datum } from "./types.ts";

/** CSV mit Anführungszeichen, ; , oder Tab. Trennzeichen wird erkannt. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const ersteZeile = t.slice(0, t.indexOf("\n") >= 0 ? t.indexOf("\n") : t.length);
  const trenner = [";", "\t", ","].map((z) => [z, ersteZeile.split(z).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const zeilen: string[][] = [];
  let feld = "";
  let zeile: string[] = [];
  let inQuote = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (inQuote) {
      if (c === '"') {
        if (t[i + 1] === '"') { feld += '"'; i++; } else inQuote = false;
      } else feld += c;
    } else if (c === '"') inQuote = true;
    else if (c === trenner) { zeile.push(feld); feld = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      zeile.push(feld); feld = "";
      if (zeile.some((f) => f.trim() !== "")) zeilen.push(zeile);
      zeile = [];
    } else feld += c;
  }
  zeile.push(feld);
  if (zeile.some((f) => f.trim() !== "")) zeilen.push(zeile);
  return zeilen;
}

/** "27.10.2026", "27.10.26", "2026-10-27", "2026-10-27 14:03:11" → "2026-10-27" */
export function parseDatum(roh: string): Datum | null {
  const s = roh.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return istDatum(`${m[1]}-${m[2]}-${m[3]}`) ? `${m[1]}-${m[2]}-${m[3]}` : null;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const j = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    const d = `${j}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    return istDatum(d) ? d : null;
  }
  return null;
}

export interface RohBuchung {
  datum: Datum;
  betrag: Cent;
  gegenpartei: string;
  zweck: string;
  waehrung: string;
  saldoNach: Cent | null;
  /** Ursprüngliche Zeile zum Nachvollziehen. */
  zeile: number;
}

export interface ImportErgebnis {
  format: string;
  buchungen: RohBuchung[];
  /** Zeilen, die nicht gelesen werden konnten, mit Grund. */
  fehler: { zeile: number; grund: string }[];
}

type Feld = "datum" | "betrag" | "gegenpartei" | "zweck" | "waehrung" | "saldo" | "soll" | "haben" | "status" | "gebuehr";

// Spaltennamen der Banken (Kleinbuchstaben, ohne Umlaute). Reihenfolge = Vorrang.
const ALIASE: Record<Feld, string[]> = {
  datum: ["buchungstag", "buchungsdatum", "completed date", "datum", "date", "started date", "valutadatum", "wertstellung"],
  betrag: ["betrag", "amount", "umsatz", "betrag (eur)", "betrag in eur", "brutto"],
  gegenpartei: ["name zahlungsbeteiligter", "beguenstigter/zahlungspflichtiger", "empfaenger", "auftraggeber/empfaenger", "zahlungspartner", "gegenpartei", "description", "name", "counterparty"],
  zweck: ["verwendungszweck", "buchungstext", "beschreibung", "reference", "zweck", "betreff", "text"],
  waehrung: ["waehrung", "currency", "whrg"],
  saldo: ["saldo nach buchung", "balance", "saldo", "kontostand"],
  soll: ["soll", "ausgang", "belastung"],
  haben: ["haben", "eingang", "gutschrift"],
  status: ["state", "status"],
  gebuehr: ["fee", "gebuehr"],
};

function normal(s: string): string {
  return s.trim().toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

function kopfZuordnen(kopf: string[]): Partial<Record<Feld, number>> {
  const n = kopf.map(normal);
  const z: Partial<Record<Feld, number>> = {};
  const vergeben = new Set<number>();
  for (const feld of Object.keys(ALIASE) as Feld[]) {
    for (const alias of ALIASE[feld]) {
      const i = n.findIndex((k, idx) => k === alias && !vergeben.has(idx));
      if (i >= 0) { z[feld] = i; vergeben.add(i); break; }
    }
  }
  return z;
}

/** Erkennt die Kopfzeile (auch wenn Banken davor noch Kontoinfos schreiben) und liest die Buchungen. */
export function importiereCsv(text: string): ImportErgebnis {
  const zeilen = parseCsv(text);
  let kopfIndex = -1;
  let zuordnung: Partial<Record<Feld, number>> = {};
  for (let i = 0; i < Math.min(zeilen.length, 30); i++) {
    const z = kopfZuordnen(zeilen[i]!);
    if (z.datum !== undefined && (z.betrag !== undefined || (z.soll !== undefined && z.haben !== undefined))) {
      kopfIndex = i; zuordnung = z; break;
    }
  }
  if (kopfIndex < 0) return ohneKopf(zeilen);

  const kopf = zeilen[kopfIndex]!.map(normal);
  const format = kopf.includes("name zahlungsbeteiligter") ? "VR Bank (Atruvia)"
    : kopf.includes("completed date") ? "Revolut"
    : kopf.includes("beguenstigter/zahlungspflichtiger") ? "Sparkasse/Bank (CAMT-CSV)"
    : "allgemein";

  const buchungen: RohBuchung[] = [];
  const fehler: ImportErgebnis["fehler"] = [];
  const hole = (z: string[], f: Feld) => (zuordnung[f] === undefined ? "" : (z[zuordnung[f]!] ?? "").trim());

  for (let i = kopfIndex + 1; i < zeilen.length; i++) {
    const z = zeilen[i]!;
    const status = normal(hole(z, "status"));
    if (status && ["reverted", "declined", "failed", "pending"].includes(status)) continue;
    const datum = parseDatum(hole(z, "datum"));
    let betrag = zuordnung.betrag !== undefined ? parseBetrag(hole(z, "betrag")) : null;
    if (betrag === null && zuordnung.soll !== undefined) {
      const soll = parseBetrag(hole(z, "soll")) ?? 0;
      const haben = parseBetrag(hole(z, "haben")) ?? 0;
      betrag = haben - Math.abs(soll);
    }
    if (!datum) { fehler.push({ zeile: i + 1, grund: `Datum unlesbar: „${hole(z, "datum")}“` }); continue; }
    if (betrag === null) { fehler.push({ zeile: i + 1, grund: `Betrag unlesbar: „${hole(z, "betrag")}“` }); continue; }
    const gebuehr = parseBetrag(hole(z, "gebuehr"));
    if (gebuehr) betrag -= Math.abs(gebuehr);
    buchungen.push({
      datum, betrag,
      gegenpartei: hole(z, "gegenpartei"),
      zweck: hole(z, "zweck"),
      waehrung: hole(z, "waehrung") || "EUR",
      saldoNach: parseBetrag(hole(z, "saldo")),
      zeile: i + 1,
    });
  }
  return { format, buchungen, fehler };
}

/** Exporte ohne Kopfzeile (z. B. ELBA/Raiffeisen: Datum;Text;Valuta;Betrag;Währung;…). */
function ohneKopf(zeilen: string[][]): ImportErgebnis {
  const buchungen: RohBuchung[] = [];
  const fehler: ImportErgebnis["fehler"] = [];
  zeilen.forEach((z, i) => {
    const datum = parseDatum(z[0] ?? "");
    const betragIdx = z.findIndex((f, k) => k > 0 && /^[-+−]?[\d.]+,\d{2}$/.test(f.trim()));
    const betrag = betragIdx >= 0 ? parseBetrag(z[betragIdx]!) : null;
    if (!datum || betrag === null) { fehler.push({ zeile: i + 1, grund: "Zeile ohne erkennbares Datum oder Betrag" }); return; }
    const text = (z[1] ?? "").trim();
    buchungen.push({
      datum, betrag, gegenpartei: textZuGegenpartei(text), zweck: text,
      waehrung: (z[betragIdx + 1] ?? "EUR").trim() || "EUR", saldoNach: null, zeile: i + 1,
    });
  });
  return { format: buchungen.length ? "ohne Kopfzeile (ELBA o. ä.)" : "unbekannt", buchungen, fehler };
}

function textZuGegenpartei(text: string): string {
  // ELBA schreibt den Namen meist vor die erste Ziffernfolge oder nach "Auftraggeber:"/"Empfänger:"
  const m = /(?:Auftraggeber|Empfänger|Empfaenger):\s*([^|;]+?)(?:\s{2,}|\s+IBAN|$)/i.exec(text);
  if (m) return m[1]!.trim();
  return text.split(/\s{2,}|\|/)[0]!.trim().slice(0, 60);
}

/** Stabiler Fingerabdruck: gleiche Buchung im zweiten Export → gleicher Abdruck. */
export function fingerabdruck(kontoId: string, b: Pick<RohBuchung, "datum" | "betrag" | "gegenpartei" | "zweck">, laufnummer = 0): string {
  const roh = [kontoId, b.datum, b.betrag, normal(b.gegenpartei).replace(/\s+/g, " "), normal(b.zweck).replace(/\s+/g, " ").slice(0, 80), laufnummer].join("|");
  // FNV-1a, 2× 32 Bit – reicht für Duplikaterkennung innerhalb eines Kontos
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < roh.length; i++) {
    const c = roh.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** Vergibt Fingerabdrücke; identische Buchungen am selben Tag bekommen eine Laufnummer. */
export function mitFingerabdruck<T extends Pick<RohBuchung, "datum" | "betrag" | "gegenpartei" | "zweck">>(kontoId: string, liste: T[]): (T & { fingerabdruck: string })[] {
  const zaehler = new Map<string, number>();
  return liste.map((b) => {
    const basis = fingerabdruck(kontoId, b);
    const n = zaehler.get(basis) ?? 0;
    zaehler.set(basis, n + 1);
    return { ...b, fingerabdruck: n === 0 ? basis : fingerabdruck(kontoId, b, n) };
  });
}
