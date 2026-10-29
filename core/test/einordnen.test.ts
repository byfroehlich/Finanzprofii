import { describe, expect, it } from "vitest";
import { einordnen, type Regel } from "../src/einordnen.ts";
import { findeWiederkehrende } from "../src/wiederkehrend.ts";
import type { Buchung } from "../src/types.ts";
import { vertrag } from "./hilfen.ts";

const regeln: Regel[] = [
  { id: "r1", muster: ["airbnb"], richtung: "ein", bereich: "vermietung", kategorie: "auszahlung", erklaerung: "Auszahlung Airbnb über {betrag}.", prioritaet: 10 },
];

describe("einordnen", () => {
  it("ordnet einem Vertrag zu und meldet Abweichungen", () => {
    const v = vertrag({ muster: ["leasing"], name: "Leasing Transporter", art: "leasing" });
    const e = einordnen({ kontoId: "k1", betrag: -52_000, gegenpartei: "XY Leasing GmbH", zweck: "" }, [v], regeln);
    expect(e).toMatchObject({ vertragId: "v1", bereich: "privat", quelle: "vertrag" });
    expect(e!.erklaerung).toBe("Zahlung Leasing Transporter (monatlich), 20,00 € mehr als üblich.");
  });
  it("nutzt Regeln, wenn kein Vertrag passt", () => {
    const e = einordnen({ kontoId: "k1", betrag: 85_000, gegenpartei: "Airbnb Payments", zweck: "" }, [], regeln);
    expect(e?.erklaerung).toBe("Auszahlung Airbnb über 850,00 €.");
  });
  it("gibt null zurück, wenn nichts passt", () => {
    expect(einordnen({ kontoId: "k1", betrag: -1, gegenpartei: "?", zweck: "" }, [], regeln)).toBeNull();
  });
});

describe("findeWiederkehrende", () => {
  const b = (id: string, datum: string, betrag: number, gp = "Mobilfunk GmbH 2026"): Buchung => ({
    id, kontoId: "k1", datum, betrag, gegenpartei: gp, zweck: "", bereich: null, kategorie: null, erklaerung: null, vertragId: null, fingerabdruck: id,
  });
  it("erkennt eine monatliche Lastschrift und schlägt den nächsten Termin vor", () => {
    const r = findeWiederkehrende([b("1", "2026-07-03", -12_000), b("2", "2026-08-03", -12_000), b("3", "2026-09-02", -12_050), b("4", "2026-10-05", -12_000), b("x", "2026-10-09", -999, "Sonstwer")]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ rhythmus: "monat", betrag: -12_000, naechste: "2026-11-05", anzahl: 4 });
  });
  it("ignoriert Unregelmäßiges", () => {
    expect(findeWiederkehrende([b("1", "2026-07-03", -12_000), b("2", "2026-07-10", -12_000), b("3", "2026-09-20", -12_000)])).toEqual([]);
  });
});
