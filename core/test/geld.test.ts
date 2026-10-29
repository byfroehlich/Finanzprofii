import { describe, expect, it } from "vitest";
import { euro, euroGanz, parseBetrag } from "../src/geld.ts";

describe("geld", () => {
  it.each([
    ["1.234,56", 123456], ["-441,42", -44142], ["1234.56", 123456], ["-1,234.56", -123456],
    ["12,00 €", 1200], ["3.000", 300000], ["96,30-", -9630], ["+0,01", 1], ["−5,00", -500], ["", null], ["abc", null],
  ])("liest %s", (roh, cent) => expect(parseBetrag(roh)).toBe(cent));
  it("formatiert", () => {
    expect(euro(44142)).toBe("441,42 €");
    expect(euro(-52400)).toBe("−524,00 €");
    expect(euro(1200, true)).toBe("+12,00 €");
    expect(euroGanz(355900)).toBe("3.559");
  });
});

describe("satz", () => {
  it("entfernt doppelte Punkte nach Datum, lässt Auslassungspunkte stehen", async () => {
    const { satz } = await import("../src/geld.ts");
    expect(satz("Frühestens am 27.11..")).toBe("Frühestens am 27.11.");
    expect(satz("Liest sich ein …")).toBe("Liest sich ein …");
  });
});
