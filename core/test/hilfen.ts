import type { Konto, Vertrag } from "../src/types.ts";

export function konto(teil: Partial<Konto> = {}): Konto {
  return {
    id: "k1", name: "Girokonto", bank: "Testbank", art: "giro", bereich: "privat", waehrung: "EUR",
    saldo: 100_000, saldoDatum: "2026-11-02", puffer: 20_000, liquide: true, quelle: "manuell", sortierung: 0,
    ...teil,
  };
}

export function vertrag(teil: Partial<Vertrag> = {}): Vertrag {
  return {
    id: "v1", name: "Miete", gegenpartei: "Vermieter", kontoId: "k1", betrag: -50_000, rhythmus: "monat",
    naechsteFaelligkeit: "2026-11-15", ende: null, art: "sonstiges", bereich: "privat", werktag: false,
    muster: ["vermieter"], aktiv: true,
    ...teil,
  };
}
