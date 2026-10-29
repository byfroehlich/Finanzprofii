// Umwandlung zwischen Datenbankzeilen (snake_case) und dem Datenmodell der App.
import type {
  Aktion, Auftrag, AuftragSchritt, Bereich, Buchung, Freigabe, Frist, Konto, Planposten, Topf, Verbindlichkeit, Vertrag,
} from "./types.ts";
import type { Regel } from "./einordnen.ts";

type Zeile = Record<string, unknown>;

const n = (v: unknown): number => Number(v ?? 0);
const s = (v: unknown): string => (v == null ? "" : String(v));
const sn = (v: unknown): string | null => (v == null ? null : String(v));

export const ausZeile = {
  konto: (z: Zeile): Konto => ({
    id: s(z.id), name: s(z.name), bank: s(z.bank), art: z.art as Konto["art"], bereich: z.bereich as Bereich,
    waehrung: s(z.waehrung), saldo: n(z.saldo), saldoDatum: s(z.saldo_datum), puffer: n(z.puffer),
    liquide: Boolean(z.liquide), quelle: z.quelle as Konto["quelle"], sortierung: n(z.sortierung),
  }),
  buchung: (z: Zeile): Buchung => ({
    id: s(z.id), kontoId: s(z.konto_id), datum: s(z.datum), betrag: n(z.betrag), gegenpartei: s(z.gegenpartei),
    zweck: s(z.zweck), bereich: (z.bereich as Bereich) ?? null, kategorie: sn(z.kategorie), erklaerung: sn(z.erklaerung),
    vertragId: sn(z.vertrag_id), fingerabdruck: s(z.fingerabdruck),
  }),
  vertrag: (z: Zeile): Vertrag => ({
    id: s(z.id), name: s(z.name), gegenpartei: s(z.gegenpartei), kontoId: s(z.konto_id), betrag: n(z.betrag),
    rhythmus: z.rhythmus as Vertrag["rhythmus"], naechsteFaelligkeit: s(z.naechste_faelligkeit), ende: sn(z.ende),
    art: z.art as Vertrag["art"], bereich: z.bereich as Bereich, werktag: Boolean(z.werktag),
    muster: (z.muster as string[]) ?? [], aktiv: Boolean(z.aktiv),
  }),
  planposten: (z: Zeile): Planposten => ({
    id: s(z.id), kontoId: s(z.konto_id), datum: s(z.datum), betrag: n(z.betrag), titel: s(z.titel),
    sicherheit: z.sicherheit as Planposten["sicherheit"], status: z.status as Planposten["status"], bereich: z.bereich as Bereich,
  }),
  verbindlichkeit: (z: Zeile): Verbindlichkeit => ({
    id: s(z.id), glaeubiger: s(z.glaeubiger), betragOffen: n(z.betrag_offen), status: z.status as Verbindlichkeit["status"],
    faellig: sn(z.faellig), notiz: s(z.notiz), planpostenId: sn(z.planposten_id),
  }),
  frist: (z: Zeile): Frist => ({
    id: s(z.id), titel: s(z.titel), datum: s(z.datum), art: z.art as Frist["art"], bereich: z.bereich as Bereich, erledigt: Boolean(z.erledigt),
  }),
  freigabe: (z: Zeile): Freigabe => ({
    id: s(z.id), titel: s(z.titel), text: s(z.text), aktion: z.aktion as Aktion, status: z.status as Freigabe["status"],
    erstellt: s(z.erstellt), ergebnis: sn(z.ergebnis),
  }),
  auftrag: (z: Zeile): Auftrag => ({
    id: s(z.id), prompt: s(z.prompt), status: z.status as Auftrag["status"], schritte: (z.schritte as AuftragSchritt[]) ?? [],
    antwort: sn(z.antwort), freigabeIds: [], erstellt: s(z.erstellt),
  }),
  topf: (z: Zeile): Topf => ({
    id: s(z.id), name: s(z.name), ziel: n(z.ziel), stand: n(z.stand), zieldatum: sn(z.zieldatum), prioritaet: n(z.prioritaet), notiz: s(z.notiz),
  }),
  regel: (z: Zeile): Regel => ({
    id: s(z.id), muster: (z.muster as string[]) ?? [], richtung: z.richtung as Regel["richtung"], bereich: z.bereich as Bereich,
    kategorie: s(z.kategorie), erklaerung: s(z.erklaerung), prioritaet: n(z.prioritaet),
  }),
};

export const zuZeile = {
  konto: (k: Konto) => ({
    id: k.id, name: k.name, bank: k.bank, art: k.art, bereich: k.bereich, waehrung: k.waehrung, saldo: k.saldo,
    saldo_datum: k.saldoDatum, puffer: k.puffer, liquide: k.liquide, quelle: k.quelle, sortierung: k.sortierung,
  }),
  vertrag: (v: Vertrag) => ({
    id: v.id, name: v.name, gegenpartei: v.gegenpartei, konto_id: v.kontoId, betrag: v.betrag, rhythmus: v.rhythmus,
    naechste_faelligkeit: v.naechsteFaelligkeit, ende: v.ende, art: v.art, bereich: v.bereich, werktag: v.werktag,
    muster: v.muster, aktiv: v.aktiv,
  }),
  planposten: (p: Omit<Planposten, "id"> & { id?: string }) => ({
    ...(p.id ? { id: p.id } : {}), konto_id: p.kontoId, datum: p.datum, betrag: p.betrag, titel: p.titel,
    sicherheit: p.sicherheit, status: p.status, bereich: p.bereich,
  }),
  verbindlichkeit: (v: Verbindlichkeit) => ({
    id: v.id, glaeubiger: v.glaeubiger, betrag_offen: v.betragOffen, status: v.status, faellig: v.faellig, notiz: v.notiz,
    planposten_id: v.planpostenId,
  }),
  frist: (f: Frist) => ({ id: f.id, titel: f.titel, datum: f.datum, art: f.art, bereich: f.bereich, erledigt: f.erledigt }),
  topf: (t: Omit<Topf, "id"> & { id?: string }) => ({
    ...(t.id ? { id: t.id } : {}), name: t.name, ziel: t.ziel, stand: t.stand, zieldatum: t.zieldatum, prioritaet: t.prioritaet, notiz: t.notiz,
  }),
};
