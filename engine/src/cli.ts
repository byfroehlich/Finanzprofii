// `zentrale` auf der Kommandozeile – für Einrichtung und Fehlersuche.
// Claude nutzt dieselben Werkzeuge über den MCP-Server (mcp.ts), nicht diese CLI.
import { readFileSync } from "node:fs";
import { euro, importiereCsv, kurzesDatum, pruefeAktion, zuZeile, type Konto, type Topf } from "@zentrale/core";
import { config } from "./config.ts";
import { db, pruefe } from "./db.ts";
import { speichereBuchungen } from "./import.ts";
import { WERKZEUGE } from "./werkzeuge.ts";

function argumente(argv: string[]) {
  const pos: string[] = [];
  const opt: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const k = a.slice(2).replace(/-/g, "_");
      const v = argv[i + 1];
      if (v !== undefined && !v.startsWith("--")) { opt[k] = v; i++; } else opt[k] = true;
    } else pos.push(a);
  }
  return { pos, opt };
}

const HILFE = `zentrale BEFEHL [--option wert]

${Object.entries(WERKZEUGE).map(([n, w]) => `  ${n.padEnd(11)} ${w.beschreibung.split(". ")[0]}`).join("\n")}
  import      KONTO DATEI.csv – Kontoauszug einlesen
  einspielen  DATEI.json – Konten, Verträge, offene Posten, Fristen, Töpfe, Regeln anlegen oder aktualisieren

Beispiele: zentrale stand · zentrale leisten --betrag_euro 1800 · zentrale buchungen --unklar --max 20
Mit --json kommt die Ausgabe als JSON.`;

async function main() {
  const { pos, opt } = argumente(process.argv.slice(2));
  const befehl = pos[0];
  if (befehl === "import") {
    const [, konto, datei] = pos;
    if (!konto || !datei) throw new Error("Aufruf: zentrale import KONTO DATEI.csv");
    const roh = readFileSync(datei);
    // Banken liefern UTF-8 oder Windows-1252
    const utf8 = new TextDecoder().decode(roh);
    const text = utf8.includes("\ufffd") ? new TextDecoder("windows-1252").decode(roh) : utf8;
    const r = importiereCsv(text);
    const e = await speichereBuchungen(konto, r.buchungen, "csv");
    console.log(`${r.format}: ${e.neu} neu, ${e.doppelt} schon vorhanden, ${e.unklar} noch zu erklären.`
      + (e.saldo ? ` Kontostand ${euro(e.saldo.saldo)} (${kurzesDatum(e.saldo.datum)}).` : "")
      + (r.fehler.length ? `\n${r.fehler.length} Zeilen übersprungen:\n` + r.fehler.slice(0, 10).map((f) => `  Zeile ${f.zeile}: ${f.grund}`).join("\n") : ""));
    return;
  }
  if (befehl === "einspielen") {
    if (!pos[1]) throw new Error("Aufruf: zentrale einspielen DATEI.json");
    console.log(await einspielen(JSON.parse(readFileSync(pos[1], "utf8"))));
    return;
  }
  const w = befehl ? WERKZEUGE[befehl] : undefined;
  if (!w) {
    console.log(HILFE);
    if (befehl && befehl !== "hilfe") process.exitCode = 2;
    return;
  }
  if (befehl === "leisten" && pos[1]) opt.betrag_euro = pos[1];
  if (befehl === "erklaere" && pos[1]) opt.id = pos[1];
  const r = await w.aus(opt);
  console.log(opt.json ? JSON.stringify(r.daten, null, 2) : r.text);
}

interface Startdaten {
  konten?: (Partial<Konto> & Pick<Konto, "id" | "name" | "bank" | "art" | "bereich" | "saldo" | "saldoDatum">)[];
  vertraege?: unknown[];
  verbindlichkeiten?: unknown[];
  fristen?: unknown[];
  toepfe?: (Omit<Topf, "id"> & { id?: string })[];
  regeln?: { muster: string[]; richtung?: string; bereich: string; kategorie: string; erklaerung: string; prioritaet?: number }[];
}

/** Startbestand aus einer privaten JSON-Datei (liegt nur auf dem Server, nie im Repo). */
async function einspielen(d: Startdaten): Promise<string> {
  const owner = config.owner();
  const teile: string[] = [];
  if (d.konten?.length) {
    pruefe(await db().from("konten").upsert(d.konten.map((k, i) => ({ owner, ...zuZeile.konto({ sortierung: i, liquide: true, quelle: "manuell", waehrung: "EUR", puffer: 0, ...k }) }))).select("id"), "Konten");
    teile.push(`${d.konten.length} Konten`);
  }
  // Verträge, Posten und Fristen laufen durch dieselbe Prüfung wie Claudes Vorschläge
  const geprueft = <T>(typ: string, feld: string, liste: unknown[] | undefined): T[] => (liste ?? []).map((x, i) => {
    const r = pruefeAktion({ typ, [feld]: x });
    if (!r.ok) throw new Error(`${typ} Nr. ${i + 1}: ${r.fehler}`);
    return x as T;
  });
  const vertraege = geprueft<Parameters<typeof zuZeile.vertrag>[0]>("vertrag", "vertrag", d.vertraege);
  if (vertraege.length) {
    pruefe(await db().from("vertraege").upsert(vertraege.map((v) => ({ owner, ...zuZeile.vertrag(v) }))).select("id"), "Verträge");
    teile.push(`${vertraege.length} Verträge`);
  }
  const offen = geprueft<Parameters<typeof zuZeile.verbindlichkeit>[0]>("verbindlichkeit", "verbindlichkeit", d.verbindlichkeiten);
  if (offen.length) {
    pruefe(await db().from("verbindlichkeiten").upsert(offen.map((v) => ({ owner, ...zuZeile.verbindlichkeit({ ...v, planpostenId: v.planpostenId ?? null }) }))).select("id"), "Offene Posten");
    teile.push(`${offen.length} offene Posten`);
  }
  const fristen = geprueft<{ id?: string; titel: string; datum: string; art: string; bereich: string }>("frist", "frist", d.fristen);
  if (fristen.length) {
    pruefe(await db().from("fristen").upsert(fristen.map((f, i) => ({ owner, id: f.id ?? `start-${i + 1}`, titel: f.titel, datum: f.datum, art: f.art, bereich: f.bereich, erledigt: false }))).select("id"), "Fristen");
    teile.push(`${fristen.length} Fristen`);
  }
  if (d.toepfe?.length) {
    for (const t of d.toepfe) pruefe(await db().from("toepfe").upsert({ owner, ...zuZeile.topf(t) }).select("id"), "Töpfe");
    teile.push(`${d.toepfe.length} Töpfe`);
  }
  if (d.regeln?.length) {
    pruefe(await db().from("regeln").insert(d.regeln.map((r) => ({ owner, richtung: "beide", prioritaet: 0, ...r }))).select("id"), "Regeln");
    teile.push(`${d.regeln.length} Regeln`);
  }
  return teile.length ? `Eingespielt: ${teile.join(", ")}.` : "Nichts zum Einspielen gefunden.";
}

main().catch((e: unknown) => {
  console.error(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
