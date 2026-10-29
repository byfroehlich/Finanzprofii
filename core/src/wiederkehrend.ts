import { plusMonate, plusTage, tageZwischen } from "./datum.ts";
import type { Buchung, Cent, Datum, Rhythmus } from "./types.ts";

export interface VertragsVorschlag {
  name: string;
  gegenpartei: string;
  kontoId: string;
  betrag: Cent;
  rhythmus: Rhythmus;
  letzte: Datum;
  naechste: Datum;
  anzahl: number;
  muster: string[];
  buchungIds: string[];
}

const RHYTHMUS_TAGE: [Rhythmus, number, number][] = [
  ["woche", 7, 1],
  ["14tage", 14, 2],
  ["monat", 30.44, 4],
  ["quartal", 91.3, 8],
  ["halbjahr", 182.6, 12],
  ["jahr", 365.25, 15],
];

const FUELLWOERTER = new Set(["gmbh", "ag", "se", "kg", "co", "und", "eg", "bank", "sagt", "danke", "lastschrift", "sepa", "von", "der", "die", "das"]);

/** Gegenpartei auf ihren Kern reduzieren: „LEASYS S.P.A. NL DEUTSCHLAND 2026/10“ → ["leasys", "s.p.a."]. */
export function kernworte(gegenpartei: string): string[] {
  return gegenpartei
    .toLowerCase()
    .replace(/[0-9/\\:#*_-]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !FUELLWOERTER.has(w))
    .slice(0, 2);
}

function median(z: number[]): number {
  const s = [...z].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Sucht in der Buchungshistorie nach regelmäßigen Zahlungen, die noch kein Vertrag sind. */
export function findeWiederkehrende(buchungen: Buchung[], mindestens = 3): VertragsVorschlag[] {
  const gruppen = new Map<string, Buchung[]>();
  for (const b of buchungen) {
    if (b.vertragId) continue;
    const kern = kernworte(b.gegenpartei);
    if (!kern.length) continue;
    const key = `${b.kontoId}|${Math.sign(b.betrag)}|${kern.join(" ")}`;
    (gruppen.get(key) ?? gruppen.set(key, []).get(key)!).push(b);
  }

  const vorschlaege: VertragsVorschlag[] = [];
  for (const [key, liste] of gruppen) {
    // Innerhalb einer Gegenpartei nach Betrag bündeln (±10 %), z. B. zwei Leasingverträge beim selben Anbieter
    const sortiert = [...liste].sort((a, b) => Math.abs(a.betrag) - Math.abs(b.betrag));
    const cluster: Buchung[][] = [];
    for (const b of sortiert) {
      const c = cluster.find((x) => Math.abs(Math.abs(b.betrag) - Math.abs(median(x.map((y) => y.betrag)))) <= Math.abs(b.betrag) * 0.1);
      if (c) c.push(b); else cluster.push([b]);
    }
    for (const c of cluster) {
      if (c.length < mindestens) continue;
      const zeitlich = [...c].sort((a, b) => (a.datum < b.datum ? -1 : 1));
      const abstaende = zeitlich.slice(1).map((b, i) => tageZwischen(zeitlich[i]!.datum, b.datum));
      const m = median(abstaende);
      const treffer = RHYTHMUS_TAGE.find(([, tage, tol]) => Math.abs(m - tage) <= tol);
      if (!treffer) continue;
      const [rhythmus, tage, tol] = treffer;
      const regelmaessig = abstaende.filter((a) => Math.abs(a - tage) <= tol * 1.5).length / abstaende.length;
      if (regelmaessig < 0.7) continue;
      const letzte = zeitlich[zeitlich.length - 1]!;
      const naechste = rhythmus === "woche" || rhythmus === "14tage"
        ? plusTage(letzte.datum, Math.round(tage))
        : plusMonate(letzte.datum, { monat: 1, quartal: 3, halbjahr: 6, jahr: 12 }[rhythmus]);
      const kern = key.split("|")[2]!;
      vorschlaege.push({
        name: letzte.gegenpartei.trim() || kern,
        gegenpartei: letzte.gegenpartei,
        kontoId: letzte.kontoId,
        betrag: Math.round(median(c.map((b) => b.betrag))),
        rhythmus, letzte: letzte.datum, naechste, anzahl: c.length,
        muster: kern.split(" "),
        buchungIds: c.map((b) => b.id),
      });
    }
  }
  return vorschlaege.sort((a, b) => Math.abs(b.betrag) - Math.abs(a.betrag));
}
