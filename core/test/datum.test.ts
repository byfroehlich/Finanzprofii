import { describe, expect, it } from "vitest";
import { langesDatum, naechsterWerktag, plusMonate, tageZwischen } from "../src/datum.ts";

describe("datum", () => {
  it("hält den Monatsanker über kurze Monate", () => {
    expect(plusMonate("2026-01-31", 1, 31)).toBe("2026-02-28");
    expect(plusMonate("2026-01-31", 2, 31)).toBe("2026-03-31");
    expect(plusMonate("2026-11-30", 3)).toBe("2027-02-28");
  });
  it("schiebt Wochenenden auf Montag", () => {
    expect(naechsterWerktag("2026-10-31")).toBe("2026-11-02"); // Samstag
    expect(naechsterWerktag("2026-11-01")).toBe("2026-11-02"); // Sonntag
    expect(naechsterWerktag("2026-10-29")).toBe("2026-10-29");
  });
  it("zählt Tage über die Zeitumstellung", () => {
    expect(tageZwischen("2026-10-24", "2026-10-26")).toBe(2);
  });
  it("schreibt deutsche Datumsangaben", () => {
    expect(langesDatum("2026-10-29")).toBe("Donnerstag, 29. Oktober");
  });
});
