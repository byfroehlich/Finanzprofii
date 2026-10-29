// Gemeinsames Datenmodell von Web-App und Engine.
// Beträge immer in Cent (ganze Zahlen), Datumsangaben als "JJJJ-MM-TT".

export type Datum = string;
export type Cent = number;

export type Bereich =
  | "privat"
  | "byfroehlich"
  | "gbr"
  | "vermietung"
  | "familie"
  | "trading"
  | "sonstiges";

export const BEREICHE: Record<Bereich, string> = {
  privat: "Privat",
  byfroehlich: "byFröhlich",
  gbr: "GbR",
  vermietung: "Vermietung",
  familie: "Familie (durchlaufend)",
  trading: "Trading",
  sonstiges: "Sonstiges",
};

export type KontoArt = "giro" | "geschaeft" | "karte" | "paypal" | "depot" | "kredit";
export type Quelle = "fints" | "api" | "aggregator" | "csv" | "browser" | "manuell";

export interface Konto {
  id: string;
  name: string;
  bank: string;
  art: KontoArt;
  bereich: Bereich;
  waehrung: string;
  saldo: Cent;
  saldoDatum: Datum;
  /** Unter diesem Stand gilt das Konto als knapp. */
  puffer: Cent;
  /** Zählt zur verfügbaren Liquidität (Kredite und Depots nicht). */
  liquide: boolean;
  quelle: Quelle;
  sortierung: number;
}

export interface Buchung {
  id: string;
  kontoId: string;
  datum: Datum;
  betrag: Cent;
  gegenpartei: string;
  zweck: string;
  bereich: Bereich | null;
  kategorie: string | null;
  /** Ein Satz: was ist passiert. */
  erklaerung: string | null;
  vertragId: string | null;
  /** Eindeutiger Fingerabdruck gegen doppelte Importe. */
  fingerabdruck: string;
}

export type Rhythmus = "woche" | "14tage" | "monat" | "quartal" | "halbjahr" | "jahr";

export const RHYTHMEN: Record<Rhythmus, string> = {
  woche: "wöchentlich",
  "14tage": "alle 14 Tage",
  monat: "monatlich",
  quartal: "quartalsweise",
  halbjahr: "halbjährlich",
  jahr: "jährlich",
};

export type VertragArt =
  | "einnahme"
  | "kredit"
  | "leasing"
  | "versicherung"
  | "abo"
  | "rate"
  | "steuer"
  | "nebenkosten"
  | "sonstiges";

/** Wiederkehrende Zahlung, Ein- oder Ausgang. */
export interface Vertrag {
  id: string;
  name: string;
  gegenpartei: string;
  kontoId: string;
  /** Negativ = Ausgang. */
  betrag: Cent;
  rhythmus: Rhythmus;
  /** Nächster Termin, ab dem weitergerechnet wird. */
  naechsteFaelligkeit: Datum;
  /** Letzte Zahlung, danach endet der Vertrag. */
  ende: Datum | null;
  art: VertragArt;
  bereich: Bereich;
  /** Wochenende auf den nächsten Werktag schieben (Lastschriften, Auszahlungen). */
  werktag: boolean;
  /** Suchmuster (Kleinbuchstaben), um Buchungen dem Vertrag zuzuordnen. */
  muster: string[];
  aktiv: boolean;
}

export type Sicherheit = "sicher" | "wahrscheinlich" | "offen";

/** Einmaliger erwarteter Ein- oder Ausgang. */
export interface Planposten {
  id: string;
  kontoId: string;
  datum: Datum;
  betrag: Cent;
  titel: string;
  sicherheit: Sicherheit;
  status: "geplant" | "erledigt" | "verworfen";
  bereich: Bereich;
}

/** Rückstände, gestundete Posten, offene Forderungen gegen Mathias. */
export interface Verbindlichkeit {
  id: string;
  glaeubiger: string;
  betragOffen: Cent;
  status: "rueckstand" | "gestundet" | "ratenzahlung" | "geklaert";
  faellig: Datum | null;
  notiz: string;
  /** Eingeplant als Planposten, damit sie nicht immer wieder als „offen“ auftaucht. */
  planpostenId: string | null;
}

export interface Frist {
  id: string;
  titel: string;
  datum: Datum;
  art: "frist" | "termin" | "wiedervorlage" | "anreise" | "abreise";
  bereich: Bereich;
  erledigt: boolean;
}

/** Was nach einer Freigabe ausgeführt wird. Die Engine kennt nur diese Typen. */
export type Aktion =
  | { typ: "planposten"; posten: Omit<Planposten, "id" | "status"> }
  | { typ: "zahlung_vorbereiten"; kontoId: string; empfaenger: string; iban?: string; betrag: Cent; zweck: string; datum: Datum }
  | { typ: "mail"; an: string; betreff: string; text: string; von?: string }
  | { typ: "frist"; frist: Omit<Frist, "id" | "erledigt"> }
  | { typ: "vertrag"; vertrag: Vertrag }
  | { typ: "verbindlichkeit"; verbindlichkeit: Verbindlichkeit }
  | { typ: "claude"; auftrag: string }
  | { typ: "notiz"; text: string };

export interface Freigabe {
  id: string;
  titel: string;
  text: string;
  aktion: Aktion;
  status: "offen" | "freigegeben" | "abgelehnt" | "spaeter" | "ausgefuehrt" | "fehler";
  erstellt: string;
  ergebnis: string | null;
}

export interface AuftragSchritt {
  text: string;
  status: "laeuft" | "fertig";
}

export interface Auftrag {
  id: string;
  prompt: string;
  status: "neu" | "laeuft" | "fertig" | "fehler";
  schritte: AuftragSchritt[];
  antwort: string | null;
  freigabeIds: string[];
  erstellt: string;
}

export interface Topf {
  id: string;
  name: string;
  ziel: Cent;
  stand: Cent;
  zieldatum: Datum | null;
  prioritaet: number;
  notiz: string;
}

/** Alles, was die App für die Darstellung braucht. */
export interface Bestand {
  konten: Konto[];
  vertraege: Vertrag[];
  planposten: Planposten[];
  buchungen: Buchung[];
  verbindlichkeiten: Verbindlichkeit[];
  fristen: Frist[];
  freigaben: Freigabe[];
  toepfe: Topf[];
  stand: string;
}
