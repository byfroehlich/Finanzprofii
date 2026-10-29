import { describe, expect, it } from "vitest";
import { beschreibeAktion, pruefeAktion } from "../src/aktion.ts";

describe("aktion", () => {
  it("lässt gültige Aktionen durch", () => {
    const a = { typ: "zahlung_vorbereiten", kontoId: "vr", empfaenger: "Händler", betrag: 44_142, zweck: "Rechnung 1", datum: "2026-11-05" };
    const r = pruefeAktion(a);
    expect(r.ok).toBe(true);
    if (r.ok) expect(beschreibeAktion(r.aktion, () => "Girokonto")).toBe("Überweisung vorbereiten: 441,42 € an Händler, „Rechnung 1“, am 5.11. von Girokonto. Bestätigen musst du in der Bank-App.");
  });
  it.each([
    [{ typ: "loeschen" }, "Unbekannter Typ"],
    [{ typ: "mail", an: "kein-mail", betreff: "x", text: "y" }, "Empfänger ungültig"],
    [{ typ: "planposten", posten: { kontoId: "vr", datum: "2026-13-01", betrag: 1, titel: "x", sicherheit: "sicher", bereich: "privat" } }, "nötig"],
    [{ typ: "zahlung_vorbereiten", kontoId: "vr", empfaenger: "x", betrag: 1.5, zweck: "x", datum: "2026-11-05" }, "nötig"],
    ["text", "typ"],
  ])("lehnt %j ab", (a, teil) => {
    const r = pruefeAktion(a);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler).toContain(teil);
  });
});
