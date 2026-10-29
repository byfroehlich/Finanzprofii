import { istDatum, kurzesDatum } from "./datum.ts";
import { euro } from "./geld.ts";
import { BEREICHE, RHYTHMEN } from "./types.ts";
import type { Aktion, Bereich } from "./types.ts";

type Pruefung = { ok: true; aktion: Aktion } | { ok: false; fehler: string };

const istObjekt = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const text = (o: Record<string, unknown>, k: string, max = 2000) => typeof o[k] === "string" && (o[k] as string).trim().length > 0 && (o[k] as string).length <= max;
const ganz = (o: Record<string, unknown>, k: string) => Number.isSafeInteger(o[k]) && o[k] !== 0;
const datum = (o: Record<string, unknown>, k: string) => typeof o[k] === "string" && istDatum(o[k] as string);
const bereich = (o: Record<string, unknown>, k: string) => typeof o[k] === "string" && (o[k] as string) in BEREICHE;

/** Prüft eine Aktion aus Claude-Vorschlägen streng, bevor sie als Freigabe gespeichert wird. */
export function pruefeAktion(x: unknown): Pruefung {
  if (!istObjekt(x) || typeof x.typ !== "string") return { ok: false, fehler: "Aktion braucht ein Feld „typ“." };
  const f = (fehler: string): Pruefung => ({ ok: false, fehler: `${x.typ}: ${fehler}` });
  switch (x.typ) {
    case "planposten": {
      const p = x.posten;
      if (!istObjekt(p)) return f("„posten“ fehlt");
      if (!text(p, "kontoId", 100) || !datum(p, "datum") || !ganz(p, "betrag") || !text(p, "titel", 200)) return f("kontoId, datum, betrag (Cent, ≠ 0) und titel nötig");
      if (!["sicher", "wahrscheinlich", "offen"].includes(p.sicherheit as string)) return f("sicherheit: sicher | wahrscheinlich | offen");
      if (!bereich(p, "bereich")) return f("bereich ungültig");
      break;
    }
    case "zahlung_vorbereiten":
      if (!text(x, "kontoId", 100) || !text(x, "empfaenger", 140) || !ganz(x, "betrag") || !text(x, "zweck", 140) || !datum(x, "datum")) return f("kontoId, empfaenger, betrag (Cent), zweck, datum nötig");
      if ((x.betrag as number) < 0) return f("betrag positiv angeben");
      if (x.iban !== undefined && !(typeof x.iban === "string" && /^[A-Z]{2}\d{2}[A-Z0-9 ]{10,32}$/.test(x.iban))) return f("IBAN ungültig");
      break;
    case "mail":
      if (!text(x, "an", 300) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(x.an).trim())) return f("Empfänger ungültig");
      if (!text(x, "betreff", 300) || !text(x, "text", 20_000)) return f("betreff und text nötig");
      break;
    case "frist": {
      const p = x.frist;
      if (!istObjekt(p) || !text(p, "titel", 200) || !datum(p, "datum") || !bereich(p, "bereich")) return f("titel, datum, bereich nötig");
      if (!["frist", "termin", "wiedervorlage", "anreise", "abreise"].includes(p.art as string)) return f("art ungültig");
      break;
    }
    case "vertrag": {
      const v = x.vertrag;
      if (!istObjekt(v) || !text(v, "id", 100) || !text(v, "name", 200) || !text(v, "kontoId", 100) || !ganz(v, "betrag") || !datum(v, "naechsteFaelligkeit")) return f("id, name, kontoId, betrag, naechsteFaelligkeit nötig");
      if (!((v.rhythmus as string) in RHYTHMEN)) return f("rhythmus ungültig");
      if (!bereich(v, "bereich")) return f("bereich ungültig");
      if (v.ende != null && !datum(v, "ende")) return f("ende ungültig");
      if (!Array.isArray(v.muster) || !v.muster.every((m) => typeof m === "string" && m.length >= 3)) return f("muster: Liste von Suchwörtern (je ≥ 3 Zeichen)");
      break;
    }
    case "verbindlichkeit": {
      const v = x.verbindlichkeit;
      if (!istObjekt(v) || !text(v, "id", 100) || !text(v, "glaeubiger", 200) || !Number.isSafeInteger(v.betragOffen)) return f("id, glaeubiger, betragOffen nötig");
      if (!["rueckstand", "gestundet", "ratenzahlung", "geklaert"].includes(v.status as string)) return f("status ungültig");
      break;
    }
    case "claude":
      if (!text(x, "auftrag", 4000)) return f("auftrag nötig");
      break;
    case "notiz":
      if (!text(x, "text", 4000)) return f("text nötig");
      break;
    default:
      return { ok: false, fehler: `Unbekannter Typ „${x.typ}“` };
  }
  return { ok: true, aktion: x as unknown as Aktion };
}

/** Genau das, was ausgeführt wird – in einem Satz, für die Freigabekarte. */
export function beschreibeAktion(a: Aktion, kontoName: (id: string) => string = (id) => id): string {
  switch (a.typ) {
    case "planposten":
      return `Einplanen: ${a.posten.titel}, ${euro(a.posten.betrag, true)} am ${kurzesDatum(a.posten.datum)} auf ${kontoName(a.posten.kontoId)}.`;
    case "zahlung_vorbereiten":
      return `Überweisung vorbereiten: ${euro(a.betrag)} an ${a.empfaenger}${a.iban ? ` (${a.iban})` : ""}, „${a.zweck}“, am ${kurzesDatum(a.datum)} von ${kontoName(a.kontoId)}. Bestätigen musst du in der Bank-App.`;
    case "mail":
      return `Mail senden an ${a.an}: „${a.betreff}“.`;
    case "frist":
      return `Termin eintragen: ${a.frist.titel} am ${kurzesDatum(a.frist.datum)}.`;
    case "vertrag":
      return `Wiederkehrende Zahlung speichern: ${a.vertrag.name}, ${euro(a.vertrag.betrag, true)} ${RHYTHMEN[a.vertrag.rhythmus]}, nächste am ${kurzesDatum(a.vertrag.naechsteFaelligkeit)}.`;
    case "verbindlichkeit":
      return `Offenen Posten speichern: ${a.verbindlichkeit.glaeubiger}, ${euro(a.verbindlichkeit.betragOffen)} (${a.verbindlichkeit.status}).`;
    case "claude":
      return `Claude-Auftrag starten: „${a.auftrag}“`;
    case "notiz":
      return `Notiz: ${a.text}`;
  }
}

export function bereichName(b: Bereich | null): string {
  return b ? BEREICHE[b] : "nicht zugeordnet";
}
