import { naechsterWerktag, plusMonate, plusTage, heute as heuteDatum } from "./datum.ts";
import type { Bestand, Cent, Datum, Konto, Planposten, Rhythmus, Sicherheit, Vertrag } from "./types.ts";

export interface Ereignis {
  datum: Datum;
  kontoId: string;
  betrag: Cent;
  titel: string;
  art: "vertrag" | "plan";
  refId: string;
  sicherheit: Sicherheit;
}

export interface Punkt {
  datum: Datum;
  saldo: Cent;
}

export interface Verlauf {
  kontoId: string;
  name: string;
  start: Punkt;
  /** Ein Punkt je Tag ab `start.datum`. */
  punkte: Punkt[];
  ereignisse: Ereignis[];
  tiefpunkt: Punkt;
  ende: Punkt;
  puffer: Cent;
  /** Erster Tag unter dem Puffer, sonst null. */
  knapp: Punkt | null;
  /** Erster Tag im Minus, sonst null. */
  minus: Punkt | null;
}

export interface Prognose {
  von: Datum;
  bis: Datum;
  konten: Verlauf[];
  /** Summe aller liquiden Konten. */
  gesamt: Verlauf;
}

export interface PrognoseOptionen {
  von?: Datum;
  tage?: number;
  /** Posten mit Sicherheit "offen" mitrechnen (Standard: nein). */
  mitOffenen?: boolean;
  /** Zusätzliche Posten zum Durchspielen („Was wäre, wenn …“). */
  extra?: Planposten[];
}

const SCHRITT: Record<Rhythmus, { tage?: number; monate?: number }> = {
  woche: { tage: 7 },
  "14tage": { tage: 14 },
  monat: { monate: 1 },
  quartal: { monate: 3 },
  halbjahr: { monate: 6 },
  jahr: { monate: 12 },
};

/** Termine eines Vertrags im Zeitraum (nach, bis]. */
export function termine(v: Vertrag, nach: Datum, bis: Datum): Datum[] {
  if (!v.aktiv) return [];
  const schritt = SCHRITT[v.rhythmus];
  const ankerTag = Number(v.naechsteFaelligkeit.slice(8, 10));
  const ergebnis: Datum[] = [];
  let planmaessig = v.naechsteFaelligkeit;
  for (let i = 0; i < 2000; i++) {
    if (v.ende && planmaessig > v.ende) break;
    const tatsaechlich = v.werktag ? naechsterWerktag(planmaessig) : planmaessig;
    if (tatsaechlich > bis) break;
    if (tatsaechlich > nach) ergebnis.push(tatsaechlich);
    planmaessig = schritt.tage
      ? plusTage(planmaessig, schritt.tage)
      : plusMonate(v.naechsteFaelligkeit, schritt.monate! * (i + 1), ankerTag);
  }
  return ergebnis;
}

function ereignisse(b: Pick<Bestand, "vertraege" | "planposten">, konto: Konto, bis: Datum, o: PrognoseOptionen): Ereignis[] {
  const nach = konto.saldoDatum;
  const liste: Ereignis[] = [];
  for (const v of b.vertraege) {
    if (v.kontoId !== konto.id) continue;
    for (const datum of termine(v, nach, bis)) {
      liste.push({ datum, kontoId: konto.id, betrag: v.betrag, titel: v.name, art: "vertrag", refId: v.id, sicherheit: "sicher" });
    }
  }
  for (const p of [...b.planposten, ...(o.extra ?? [])]) {
    if (p.kontoId !== konto.id || p.status !== "geplant") continue;
    if (p.sicherheit === "offen" && !o.mitOffenen) continue;
    // Überfällige geplante Posten fallen auf den ersten Tag nach dem Kontostand.
    // Geschätzte Posten, die über 14 Tage ausbleiben, zählen nicht mehr (die Warnung meldet sie).
    if (p.datum <= nach && p.sicherheit !== "sicher" && p.datum < plusTage(nach, -14)) continue;
    const datum = p.datum > nach ? p.datum : plusTage(nach, 1);
    if (datum > bis) continue;
    liste.push({ datum, kontoId: konto.id, betrag: p.betrag, titel: p.titel, art: "plan", refId: p.id, sicherheit: p.sicherheit });
  }
  // Am selben Tag erst Eingänge, dann Ausgänge – so rechnet die Bank meist auch
  return liste.sort((a, b) => (a.datum === b.datum ? b.betrag - a.betrag : a.datum < b.datum ? -1 : 1));
}

function tagespunkte(startDatum: Datum, startSaldo: Cent, bis: Datum, ev: Ereignis[]): Punkt[] {
  const proTag = new Map<Datum, Cent>();
  for (const e of ev) proTag.set(e.datum, (proTag.get(e.datum) ?? 0) + e.betrag);
  const punkte: Punkt[] = [];
  let saldo = startSaldo;
  for (let d = startDatum; d <= bis; d = plusTage(d, 1)) {
    if (d !== startDatum) saldo += proTag.get(d) ?? 0;
    punkte.push({ datum: d, saldo });
  }
  return punkte;
}

export function prognose(b: Pick<Bestand, "konten" | "vertraege" | "planposten">, o: PrognoseOptionen = {}): Prognose {
  const von = o.von ?? heuteDatum();
  const bis = plusTage(von, o.tage ?? 183);
  const konten = b.konten
    .filter((k) => k.art !== "kredit")
    .map((k) => {
      // Ein älterer Kontostand wird mit den Terminen seitdem bis heute fortgeschrieben
      const start = k.saldoDatum < von ? k.saldoDatum : von;
      const ev = ereignisse(b, k, bis, o);
      const punkte = tagespunkte(start, k.saldo, bis, ev).filter((p) => p.datum >= von);
      return zusammenfassen(k.id, k.name, punkte, ev.filter((e) => e.datum >= von), k.puffer);
    });

  const liquide = new Set(b.konten.filter((k) => k.liquide).map((k) => k.id));
  const relevant = konten.filter((v) => liquide.has(v.kontoId));
  const summe = new Map<Datum, Cent>();
  for (const v of relevant) for (const p of v.punkte) summe.set(p.datum, (summe.get(p.datum) ?? 0) + p.saldo);
  const punkte = [...summe.entries()].sort(([a], [c]) => (a < c ? -1 : 1)).map(([datum, saldo]) => ({ datum, saldo }));
  const puffer = b.konten.filter((k) => liquide.has(k.id)).reduce((s, k) => s + k.puffer, 0);
  const gesamt = zusammenfassen("gesamt", "Alle Konten", punkte, relevant.flatMap((v) => v.ereignisse), puffer);
  return { von, bis, konten, gesamt };
}

function zusammenfassen(kontoId: string, name: string, punkte: Punkt[], ev: Ereignis[], puffer: Cent): Verlauf {
  const erster = punkte[0] ?? { datum: "", saldo: 0 };
  let tief = erster;
  let knapp: Punkt | null = null;
  let minus: Punkt | null = null;
  for (const p of punkte) {
    if (p.saldo < tief.saldo) tief = p;
    if (!knapp && p.saldo < puffer) knapp = p;
    if (!minus && p.saldo < 0) minus = p;
  }
  return {
    kontoId, name, start: erster, punkte,
    ereignisse: [...ev].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0)),
    tiefpunkt: tief, ende: punkte[punkte.length - 1] ?? erster, puffer, knapp, minus,
  };
}

/** Tiefpunkt bis zu einem Datum, z. B. bis zum nächsten großen Eingang. */
export function tiefpunktBis(v: Verlauf, bis: Datum): Punkt {
  let tief = v.start;
  for (const p of v.punkte) {
    if (p.datum > bis) break;
    if (p.saldo < tief.saldo) tief = p;
  }
  return tief;
}

/** Nächster Eingang ab einer Mindesthöhe. */
export function naechsterGrosserEingang(v: Verlauf, abCent: Cent = 100_000): Ereignis | null {
  return v.ereignisse.find((e) => e.betrag >= abCent) ?? null;
}

export interface LeistenErgebnis {
  passt: boolean;
  betrag: Cent;
  datum: Datum;
  kontoId: string;
  tiefpunktVorher: Punkt;
  tiefpunktNachher: Punkt;
  puffer: Cent;
  /** Frühester Tag, an dem es ohne Unterschreiten des Puffers geht (null = im Zeitraum nicht). */
  fruehestens: Datum | null;
}

/** „Kann ich mir das leisten?“ – spielt eine Ausgabe durch und sucht notfalls den frühesten Termin. */
export function kannIchMirLeisten(
  b: Pick<Bestand, "konten" | "vertraege" | "planposten">,
  betrag: Cent,
  kontoId: string,
  datum: Datum,
  o: PrognoseOptionen = {},
): LeistenErgebnis {
  const konto = b.konten.find((k) => k.id === kontoId);
  if (!konto) throw new Error(`Konto ${kontoId} unbekannt`);
  const ausgabe = (d: Datum): Planposten => ({
    id: "was-waere-wenn", kontoId, datum: d, betrag: -Math.abs(betrag),
    titel: "Geplante Ausgabe", sicherheit: "sicher", status: "geplant", bereich: konto.bereich,
  });
  const tiefAb = (extra: Planposten[], ab: Datum) => {
    const v = prognose(b, { ...o, extra: [...(o.extra ?? []), ...extra] }).konten.find((x) => x.kontoId === kontoId)!;
    return tiefpunktBis({ ...v, start: v.punkte.find((p) => p.datum >= ab) ?? v.start, punkte: v.punkte.filter((p) => p.datum >= ab) }, v.ende.datum);
  };
  const vorher = tiefAb([], datum);
  const nachher = tiefAb([ausgabe(datum)], datum);
  const passt = nachher.saldo >= konto.puffer;
  let fruehestens: Datum | null = passt ? datum : null;
  if (!passt) {
    const p = prognose(b, o);
    for (let d = plusTage(datum, 1); d <= p.bis; d = plusTage(d, 1)) {
      if (tiefAb([ausgabe(d)], d).saldo >= konto.puffer) {
        fruehestens = d;
        break;
      }
    }
  }
  return { passt, betrag: Math.abs(betrag), datum, kontoId, tiefpunktVorher: vorher, tiefpunktNachher: nachher, puffer: konto.puffer, fruehestens };
}
