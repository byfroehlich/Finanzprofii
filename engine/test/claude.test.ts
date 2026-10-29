import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

let claude: typeof import("../src/claude.ts");

beforeAll(async () => {
  process.env.CLAUDE_BIN = fileURLToPath(new URL("./fake-claude.mjs", import.meta.url));
  claude = await import("../src/claude.ts");
});

describe("claudeLauf", () => {
  it("liest Schritte, Sitzung und Antwort aus dem Stream", async () => {
    const verlauf: string[][] = [];
    const r = await claude.claudeLauf("a1", "Wie stehe ich?", null, (s) => verlauf.push(s.map((x) => `${x.text}:${x.status}`)));
    expect(r).toEqual({ antwort: "Antwort auf: Wie stehe ich? | args: sicher", sitzung: "neu", fehler: false });
    expect(verlauf.at(-1)).toEqual(["Liest Kontostände:fertig", "Liest Umsätze:fertig", "Liest wissensregister.json:fertig"]);
    expect(verlauf[1]).toEqual(["Liest Kontostände:fertig", "Liest Umsätze:laeuft"]);
  });
  it("setzt eine Sitzung fort", async () => {
    const r = await claude.claudeLauf("a2", "Und jetzt?", "alt-7", () => {});
    expect(r.sitzung).toBe("fortgesetzt");
  });
  it("meldet Abbrüche", async () => {
    const r = await claude.claudeLauf("a3", "kaputt", null, () => {});
    expect(r.fehler).toBe(true);
    expect(r.antwort).toContain("Code 3");
  });
  it("beschreibt Werkzeugaufrufe verständlich", () => {
    expect(claude.schrittText("mcp__zentrale__leisten", { betrag_euro: 1800 })).toBe("Spielt die Ausgabe durch");
    expect(claude.schrittText("mcp__zentrale__buchungen", { unklar: true })).toBe("Sucht unklare Buchungen");
    expect(claude.schrittText("Bash", {})).toBe("Arbeitet");
  });
});
