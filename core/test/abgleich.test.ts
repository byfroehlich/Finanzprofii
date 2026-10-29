import { describe, expect, it } from "vitest";
import { naechsterTerminNach, passenderPlanposten, saldoAusExport } from "../src/abgleich.ts";
import type { RohBuchung } from "../src/csv.ts";
import type { Planposten } from "../src/types.ts";
import { vertrag } from "./hilfen.ts";

describe("abgleich", () => {
  it("schiebt den Vertrag nach der Zahlung weiter", () => {
    const v = vertrag({ naechsteFaelligkeit: "2026-11-15" });
    expect(naechsterTerminNach(v, "2026-11-14")).toBe("2026-12-15");
    expect(naechsterTerminNach(v, "2026-10-20")).toBeNull();
  });
  it("findet den geplanten Posten zur Buchung", () => {
    const p: Planposten = { id: "p", kontoId: "k1", datum: "2026-11-05", betrag: -44_142, titel: "x", sicherheit: "sicher", status: "geplant", bereich: "privat" };
    expect(passenderPlanposten([p], { kontoId: "k1", datum: "2026-11-07", betrag: -44_142 })?.id).toBe("p");
    expect(passenderPlanposten([p], { kontoId: "k1", datum: "2026-11-20", betrag: -44_142 })).toBeNull();
    expect(passenderPlanposten([p], { kontoId: "k1", datum: "2026-11-05", betrag: 44_142 })).toBeNull();
    expect(passenderPlanposten([p], { kontoId: "k1", datum: "2026-11-05", betrag: -40_000 })).toBeNull();
    const schaetzung = { ...p, betrag: 80_000, sicherheit: "wahrscheinlich" as const };
    expect(passenderPlanposten([schaetzung], { kontoId: "k1", datum: "2026-11-06", betrag: 71_500 })?.id).toBe("p");
  });
  it("liest den Endsaldo unabhängig von der Sortierung", () => {
    const r = (datum: string, saldoNach: number): RohBuchung => ({ datum, betrag: 0, gegenpartei: "", zweck: "", waehrung: "EUR", saldoNach, zeile: 0 });
    expect(saldoAusExport([r("2026-10-27", 300), r("2026-10-27", 200), r("2026-10-26", 100)])).toEqual({ saldo: 300, datum: "2026-10-27" });
    expect(saldoAusExport([r("2026-10-26", 100), r("2026-10-27", 200), r("2026-10-27", 300)])).toEqual({ saldo: 300, datum: "2026-10-27" });
  });
});
