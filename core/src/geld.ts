import type { Cent } from "./types.ts";

/** "1.234,56", "-1234.56", "1 234,56 €", "+12,00" → Cent. Null, wenn es keine Zahl ist. */
export function parseBetrag(roh: string): Cent | null {
  let s = roh.trim().replace(/[€\s ]|EUR/gi, "");
  if (!s) return null;
  let vorzeichen = 1;
  if (s.endsWith("-")) {
    vorzeichen = -1;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-") || s.startsWith("−")) {
    vorzeichen *= -1;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  const letztesKomma = s.lastIndexOf(",");
  const letzterPunkt = s.lastIndexOf(".");
  if (letztesKomma > letzterPunkt) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (letzterPunkt > letztesKomma && letztesKomma >= 0) {
    s = s.replace(/,/g, "");
  } else if (letzterPunkt >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" ohne Nachkommastellen ist ein Tausenderpunkt
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return vorzeichen * Math.round(Number(s) * 100);
}

const ganz = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const genau = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 355900 → "3.559" */
export function euroGanz(c: Cent): string {
  return ganz.format(Math.round(c / 100)).replace("-", "−");
}

/** 44142 → "441,42 €" */
export function euro(c: Cent, mitVorzeichen = false): string {
  const s = genau.format(Math.abs(c) / 100) + "\u00a0€";
  if (c < 0) return "−" + s;
  return mitVorzeichen && c > 0 ? "+" + s : s;
}

export function zuCent(eur: number | string): Cent {
  return Math.round(Number(eur) * 100);
}

export function zuEuro(c: Cent): number {
  return c / 100;
}

/** Satzzeichen glätten, wenn ein Datum („27.11.“) am Satzende steht. */
export function satz(s: string): string {
  return s.replace(/\.\.(?!\.)/g, ".");
}
