import { kurzesDatum, plusTage, tageZwischen } from "./datum.ts";
import { euro, satz } from "./geld.ts";
import type { Prognose } from "./prognose.ts";
import type { Bestand, Datum } from "./types.ts";

export interface Warnung {
  /** Stabil, damit dieselbe Warnung nur einmal gepusht wird. */
  schluessel: string;
  stufe: "rot" | "gelb";
  titel: string;
  text: string;
  datum: Datum;
  kontoId?: string;
}

export function warnungen(b: Bestand, p: Prognose, heute: Datum): Warnung[] {
  const w: Warnung[] = [];

  for (const v of p.konten) {
    if (v.minus) {
      w.push({
        schluessel: `minus:${v.kontoId}:${v.minus.datum}`,
        stufe: "rot",
        titel: `${v.name} rutscht ins Minus`,
        text: `Am ${kurzesDatum(v.minus.datum)} voraussichtlich ${euro(v.minus.saldo)}. Tiefpunkt ${euro(v.tiefpunkt.saldo)} am ${kurzesDatum(v.tiefpunkt.datum)}.`,
        datum: v.minus.datum, kontoId: v.kontoId,
      });
    } else if (v.knapp) {
      w.push({
        schluessel: `knapp:${v.kontoId}:${v.knapp.datum}`,
        stufe: "gelb",
        titel: `${v.name} wird knapp`,
        text: `Ab ${kurzesDatum(v.knapp.datum)} unter dem Puffer von ${euro(v.puffer)}. Tiefpunkt ${euro(v.tiefpunkt.saldo)} am ${kurzesDatum(v.tiefpunkt.datum)}.`,
        datum: v.knapp.datum, kontoId: v.kontoId,
      });
    }
  }

  // Erwartete Eingänge, die seit mehr als 3 Tagen ausbleiben
  for (const v of b.vertraege) {
    if (!v.aktiv || v.betrag <= 0) continue;
    if (v.naechsteFaelligkeit < plusTage(heute, -3)) {
      w.push({
        schluessel: `eingang:${v.id}:${v.naechsteFaelligkeit}`,
        stufe: "rot",
        titel: `${v.name} ist nicht eingegangen`,
        text: `Erwartet am ${kurzesDatum(v.naechsteFaelligkeit)}: ${euro(v.betrag)}.`,
        datum: v.naechsteFaelligkeit,
      });
    }
  }

  for (const f of b.fristen) {
    if (f.erledigt || f.art === "anreise" || f.art === "abreise") continue;
    const tage = tageZwischen(heute, f.datum);
    if (tage < 0) {
      w.push({ schluessel: `frist:${f.id}`, stufe: "rot", titel: `Frist verpasst: ${f.titel}`, text: `War am ${kurzesDatum(f.datum)}.`, datum: f.datum });
    } else if (tage <= 7) {
      w.push({
        schluessel: `frist:${f.id}:${tage <= 2 ? "akut" : "bald"}`,
        stufe: tage <= 2 ? "rot" : "gelb",
        titel: f.titel,
        text: tage === 0 ? "Heute fällig." : tage === 1 ? "Morgen fällig." : `In ${tage} Tagen fällig (${kurzesDatum(f.datum)}).`,
        datum: f.datum,
      });
    }
  }

  for (const v of b.verbindlichkeiten) {
    if (v.status !== "rueckstand" || v.planpostenId) continue;
    w.push({
      schluessel: `rueckstand:${v.id}`,
      stufe: "gelb",
      titel: `Rückstand ${v.glaeubiger} noch nicht eingeplant`,
      text: `${euro(v.betragOffen)} offen. Ich schlage einen Termin vor.`,
      datum: v.faellig ?? heute,
    });
  }

  const rang = { rot: 0, gelb: 1 };
  for (const x of w) x.text = satz(x.text);
  return w.sort((a, c) => rang[a.stufe] - rang[c.stufe] || (a.datum < c.datum ? -1 : 1));
}
