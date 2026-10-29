import { describe, expect, it } from "vitest";
import { kannIchMirLeisten, naechsterGrosserEingang, prognose, termine, tiefpunktBis } from "../src/prognose.ts";
import type { Planposten } from "../src/types.ts";
import { konto, vertrag } from "./hilfen.ts";

const plan = (t: Partial<Planposten>): Planposten => ({
  id: "p", kontoId: "k1", datum: "2026-11-20", betrag: -10_000, titel: "Plan", sicherheit: "sicher", status: "geplant", bereich: "privat", ...t,
});

describe("termine", () => {
  it("rechnet monatlich bis zum Ende", () => {
    expect(termine(vertrag({ ende: "2027-01-15" }), "2026-11-01", "2027-06-01")).toEqual(["2026-11-15", "2026-12-15", "2027-01-15"]);
  });
  it("verschiebt auf Werktage, ohne den Anker zu verlieren", () => {
    const v = vertrag({ naechsteFaelligkeit: "2026-11-01", werktag: true });
    expect(termine(v, "2026-10-31", "2027-02-02")).toEqual(["2026-11-02", "2026-12-01", "2027-01-01", "2027-02-01"]);
  });
  it("kennt 14-tägig und quartalsweise", () => {
    expect(termine(vertrag({ rhythmus: "14tage", naechsteFaelligkeit: "2026-11-06" }), "2026-11-01", "2026-12-05")).toEqual(["2026-11-06", "2026-11-20", "2026-12-04"]);
    expect(termine(vertrag({ rhythmus: "quartal", naechsteFaelligkeit: "2026-11-10" }), "2026-11-01", "2027-06-01")).toEqual(["2026-11-10", "2027-02-10", "2027-05-10"]);
  });
  it("überspringt Termine vor dem Kontostand", () => {
    expect(termine(vertrag({ naechsteFaelligkeit: "2026-10-15" }), "2026-11-02", "2026-12-31")).toEqual(["2026-11-15", "2026-12-15"]);
  });
});

describe("prognose", () => {
  const bestand = {
    konten: [konto()],
    vertraege: [vertrag(), vertrag({ id: "lohn", name: "Pauschale", betrag: 300_000, naechsteFaelligkeit: "2026-11-27", muster: ["pauschale"] })],
    planposten: [plan({ id: "topi", betrag: -44_142, datum: "2026-11-05" })],
  };

  it("findet Tiefpunkt und Erholung", () => {
    const p = prognose(bestand, { von: "2026-11-02", tage: 60 });
    const v = p.konten[0]!;
    expect(v.start.saldo).toBe(100_000);
    // 1000 − 441,42 − 500 = 58,58 € am 15.11.
    expect(v.tiefpunkt).toEqual({ datum: "2026-11-15", saldo: 5_858 });
    expect(v.knapp?.datum).toBe("2026-11-15");
    expect(v.minus).toBeNull();
    expect(naechsterGrosserEingang(v)?.datum).toBe("2026-11-27");
    expect(tiefpunktBis(v, "2026-11-10").saldo).toBe(55_858);
  });

  it("rechnet einen alten Kontostand bis heute fort", () => {
    const p = prognose({ ...bestand, konten: [konto({ saldoDatum: "2026-11-10" })] }, { von: "2026-11-20", tage: 10 });
    // Seit 10.11.: Miete am 15.11. abgezogen; topi (5.11.) lag vor dem Kontostand und wird auf 11.11. gelegt
    expect(p.konten[0]!.start.saldo).toBe(100_000 - 44_142 - 50_000);
  });

  it("lässt lange ausgebliebene Schätzungen fallen, sichere Posten nicht", () => {
    const b = { ...bestand, vertraege: [], planposten: [
      plan({ id: "a", datum: "2026-10-10", betrag: 30_000, sicherheit: "wahrscheinlich" }),
      plan({ id: "b", datum: "2026-10-10", betrag: -20_000, sicherheit: "sicher" }),
    ] };
    expect(prognose(b, { von: "2026-11-02", tage: 5 }).konten[0]!.ende.saldo).toBe(80_000);
  });

  it("lässt offene Posten weg, außer gewünscht", () => {
    const b = { ...bestand, vertraege: [], planposten: [plan({ sicherheit: "offen", betrag: 50_000 })] };
    expect(prognose(b, { von: "2026-11-02", tage: 30 }).konten[0]!.ende.saldo).toBe(100_000);
    expect(prognose(b, { von: "2026-11-02", tage: 30, mitOffenen: true }).konten[0]!.ende.saldo).toBe(150_000);
  });

  it("summiert nur liquide Konten und lässt Kredite weg", () => {
    const b = { ...bestand, konten: [konto(), konto({ id: "k2", saldo: 500_000, liquide: false }), konto({ id: "kr", art: "kredit", saldo: -9_000_000 })] };
    const p = prognose(b, { von: "2026-11-02", tage: 5 });
    expect(p.konten.map((k) => k.kontoId)).toEqual(["k1", "k2"]);
    expect(p.gesamt.start.saldo).toBe(100_000);
  });
});

describe("kannIchMirLeisten", () => {
  const b = {
    konten: [konto({ saldo: 200_000 })],
    vertraege: [vertrag({ id: "lohn", name: "Pauschale", betrag: 300_000, naechsteFaelligkeit: "2026-12-01" })],
    planposten: [],
  };
  it("passt, wenn der Puffer hält", () => {
    const r = kannIchMirLeisten(b, 150_000, "k1", "2026-11-10", { von: "2026-11-02" });
    expect(r.passt).toBe(true);
    expect(r.tiefpunktNachher.saldo).toBe(50_000);
  });
  it("nennt den frühesten Termin, wenn es jetzt nicht passt", () => {
    const r = kannIchMirLeisten(b, 250_000, "k1", "2026-11-10", { von: "2026-11-02" });
    expect(r.passt).toBe(false);
    expect(r.fruehestens).toBe("2026-12-01");
  });
});
