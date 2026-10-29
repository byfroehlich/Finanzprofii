import { describe, expect, it } from "vitest";
import { bookingAuszahlung, smoobuZuPlan } from "../src/abrufer/smoobu.ts";

describe("smoobu", () => {
  it("legt Auszahlungsfreitage in den 14-Tage-Takt", () => {
    expect(bookingAuszahlung("2026-11-03", null)).toBe("2026-11-06");
    expect(bookingAuszahlung("2026-11-03", "2026-10-30")).toBe("2026-11-13");
    expect(bookingAuszahlung("2026-11-06", "2026-10-30")).toBe("2026-11-13");
  });
  it("übersetzt Buchungen in Termine und Auszahlungen", () => {
    const plan = smoobuZuPlan([
      { id: 1, arrival: "2026-11-10", departure: "2026-11-13", apartment: { id: 1, name: "Wohnung A" }, channel: { id: 1, name: "Airbnb" }, "guest-name": "Gast A", price: 400 },
      { id: 2, arrival: "2026-11-20", departure: "2026-11-22", apartment: { id: 2, name: "Wohnung B" }, channel: { id: 2, name: "Booking.com" }, price: "300" },
      { id: 3, type: "cancellation", arrival: "2026-12-01", departure: "2026-12-03" },
      { id: 4, arrival: "2026-12-05", departure: "2026-12-06", "is-blocked-booking": true },
    ], "at");
    expect(plan.fristen.map((f) => `${f.datum} ${f.titel}`)).toEqual([
      "2026-11-10 Anreise Wohnung A · Gast A", "2026-11-13 Abreise Wohnung A · Reinigung",
      "2026-11-20 Anreise Wohnung B · Gast", "2026-11-22 Abreise Wohnung B · Reinigung",
    ]);
    expect(plan.posten.map((p) => [p.schluessel, p.datum, p.betrag])).toEqual([["smoobu-1", "2026-11-11", 38_800], ["smoobu-2", "2026-11-27", 24_600]]);
    expect(plan.storniert).toEqual([3]);
  });
});
