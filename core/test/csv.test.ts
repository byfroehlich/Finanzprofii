import { describe, expect, it } from "vitest";
import { importiereCsv, mitFingerabdruck, parseCsv, parseDatum } from "../src/csv.ts";

describe("csv", () => {
  it("liest Anführungszeichen mit Trennzeichen und Zeilenumbruch", () => {
    expect(parseCsv('a;"b;c";"d ""x"""\r\n1;"zwei\nzeilen";3\n')).toEqual([["a", "b;c", 'd "x"'], ["1", "zwei\nzeilen", "3"]]);
  });
  it("liest Datumsformate", () => {
    expect(parseDatum("27.10.2026")).toBe("2026-10-27");
    expect(parseDatum("1.2.26")).toBe("2026-02-01");
    expect(parseDatum("2026-10-27 14:03:11")).toBe("2026-10-27");
    expect(parseDatum("31.02.2026")).toBeNull();
  });

  it("erkennt den VR-Bank-Export mit Vorspann", () => {
    const csv = [
      "Bezeichnung Auftragskonto;IBAN Auftragskonto;BIC Auftragskonto;Bankname Auftragskonto;Buchungstag;Valutadatum;Name Zahlungsbeteiligter;IBAN Zahlungsbeteiligter;BIC (SWIFT-Code) Zahlungsbeteiligter;Buchungstext;Verwendungszweck;Betrag;Waehrung;Saldo nach Buchung;Bemerkung;Kategorie;Steuerrelevant;Glaeubiger ID;Mandatsreferenz",
      "Konto;DE00;GENO;VR;27.10.2026;27.10.2026;Leasing GmbH;DE11;BIC;Lastschrift;Rate 10/2026;-299,00;EUR;1.234,56;;;;;",
      "Konto;DE00;GENO;VR;26.10.2026;26.10.2026;Kunde AG;DE22;BIC;Gutschrift;RE 17;1.500,00;EUR;1.533,56;;;;;",
    ].join("\n");
    const r = importiereCsv(csv);
    expect(r.format).toBe("VR Bank (Atruvia)");
    expect(r.fehler).toEqual([]);
    expect(r.buchungen[0]).toMatchObject({ datum: "2026-10-27", betrag: -29_900, gegenpartei: "Leasing GmbH", zweck: "Rate 10/2026", saldoNach: 123_456 });
    expect(r.buchungen[1]!.betrag).toBe(150_000);
  });

  it("liest Revolut und überspringt abgelehnte Zahlungen", () => {
    const csv = [
      "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
      "CARD_PAYMENT,Current,2026-10-20 10:00:00,2026-10-21 09:00:00,Supermarkt,-23.45,0.00,EUR,COMPLETED,100.00",
      "TRANSFER,Current,2026-10-22 10:00:00,,Kredit,-96.30,0.50,EUR,DECLINED,100.00",
    ].join("\n");
    const r = importiereCsv(csv);
    expect(r.format).toBe("Revolut");
    expect(r.buchungen).toHaveLength(1);
    expect(r.buchungen[0]).toMatchObject({ datum: "2026-10-21", betrag: -2_345, gegenpartei: "Supermarkt" });
  });

  it("liest Exporte ohne Kopfzeile", () => {
    const r = importiereCsv("27.10.2026;Auszahlung Plattform  Ref 123;27.10.2026;+850,00;EUR;27.10.2026 08:00\n");
    expect(r.buchungen[0]).toMatchObject({ datum: "2026-10-27", betrag: 85_000, gegenpartei: "Auszahlung Plattform" });
  });

  it("unterscheidet gleiche Buchungen am selben Tag", () => {
    const b = { datum: "2026-10-27", betrag: -500, gegenpartei: "Bäcker", zweck: "" };
    const [x, y] = mitFingerabdruck("k1", [b, b]);
    expect(x!.fingerabdruck).not.toBe(y!.fingerabdruck);
    expect(mitFingerabdruck("k1", [b])[0]!.fingerabdruck).toBe(x!.fingerabdruck);
  });
});
