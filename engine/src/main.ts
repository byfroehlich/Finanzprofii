// Die Engine: läuft dauerhaft auf dem Server (systemd), arbeitet Aufträge und Freigaben ab,
// ruft Konten ab, warnt und sichert.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { euro, heute, kurzesDatum, prognose, warnungen, type Aktion } from "@zentrale/core";
import { rufeFintsAb } from "./abrufer/fints.ts";
import { rufeQontoAb } from "./abrufer/qonto.ts";
import { rufeSmoobuAb } from "./abrufer/smoobu.ts";
import { fuehreAus } from "./aktionen.ts";
import { bearbeiteAuftrag } from "./claude.ts";
import { config } from "./config.ts";
import { db, ladeBestand } from "./db.ts";
import { melde } from "./push.ts";

const owner = config.owner();
const log = (...x: unknown[]) => console.log(new Date().toISOString(), ...x);

function stundeBerlin(): number {
  return Number(new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "numeric", hour12: false }).format(new Date()));
}
const ruhezeit = () => stundeBerlin() < 7 || stundeBerlin() >= 22;

// Aufträge an Claude: einer nach dem anderen ------------------------------------------
let claudeArbeitet = false;
async function auftraege() {
  if (claudeArbeitet) return;
  const r = await db().from("auftraege").select("id").eq("owner", owner).eq("status", "neu").order("erstellt").limit(1);
  const id = r.data?.[0]?.id;
  if (!id) return;
  // Übernehmen, nur wenn er noch neu ist (falls zwei Engines liefen)
  const z = await db().from("auftraege").update({ status: "laeuft" }).eq("id", id).eq("status", "neu").select("id, prompt, bezug, intern").maybeSingle();
  if (!z.data) return;
  claudeArbeitet = true;
  try {
    log("Auftrag", id);
    await bearbeiteAuftrag(z.data);
    if (!z.data.intern) {
      const offen = await db().from("freigaben").select("id", { count: "exact", head: true }).eq("auftrag_id", id).eq("status", "offen");
      await melde({ titel: "Claude ist fertig", text: offen.count ? `${offen.count} Vorschlag wartet auf dich.` : "Antwort liegt bereit.", ziel: `#/claude/${id}` });
    }
  } catch (e) {
    log("Auftrag fehlgeschlagen", e);
    await db().from("auftraege").update({ status: "fehler", antwort: String(e) }).eq("id", id);
  } finally {
    claudeArbeitet = false;
  }
}

// Freigaben ausführen ------------------------------------------------------------------
async function freigaben() {
  const r = await db().from("freigaben").select("id, titel, aktion").eq("owner", owner).eq("status", "freigegeben").order("entschieden").limit(5);
  for (const f of r.data ?? []) {
    // Erst übernehmen, dann ausführen – so läuft nichts doppelt
    const z = await db().from("freigaben").update({ status: "ausgefuehrt", ergebnis: "Wird ausgeführt …" }).eq("id", f.id).eq("status", "freigegeben").select("id").maybeSingle();
    if (!z.data) continue;
    try {
      const ergebnis = await fuehreAus(f.aktion as Aktion);
      await db().from("freigaben").update({ ergebnis }).eq("id", f.id);
      log("Freigabe ausgeführt", f.id, ergebnis);
      if ((f.aktion as Aktion).typ === "zahlung_vorbereiten") await melde({ titel: "Jetzt in der Bank-App bestätigen", text: ergebnis, ziel: "#/" });
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      await db().from("freigaben").update({ status: "fehler", ergebnis: text }).eq("id", f.id);
      await melde({ titel: `Nicht ausgeführt: ${f.titel}`, text, ziel: "#/" });
    }
  }
}

// Meldungen -----------------------------------------------------------------------------
async function neueFreigabenMelden() {
  const r = await db().from("freigaben").select("id, titel").eq("owner", owner).eq("status", "offen");
  for (const f of r.data ?? []) await melde({ titel: "Wartet auf dich", text: f.titel, ziel: "#/" }, `freigabe:${f.id}`);
}

async function warnungenMelden() {
  if (ruhezeit()) return;
  const h = heute();
  const b = await ladeBestand("2999-01-01");
  for (const w of warnungen(b, prognose(b, { von: h }), h)) {
    await melde({ titel: w.titel, text: w.text, ziel: w.kontoId ? `#/konto/${w.kontoId}` : "#/" }, `warnung:${w.schluessel}`);
  }
}

async function morgenrunde() {
  const h = heute();
  const b = await ladeBestand("2999-01-01");
  const p = prognose(b, { von: h });
  await melde({
    titel: `Guten Morgen, ${kurzesDatum(h)}`,
    text: `Alle Konten ${euro(p.gesamt.start.saldo)}. Tiefpunkt ${euro(p.gesamt.tiefpunkt.saldo)} am ${kurzesDatum(p.gesamt.tiefpunkt.datum)}.`,
    ziel: "#/",
  }, `morgen:${h}`);
  await unklareErklaeren(true);
}

/** Unklare Buchungen von Claude erklären lassen – höchstens alle 2 Stunden. */
async function unklareErklaeren(sofort = false) {
  const unklar = await db().from("buchungen").select("id", { count: "exact", head: true }).eq("owner", owner).is("erklaerung", null);
  if (!unklar.count) return;
  const seit = new Date(Date.now() - 2 * 3600_000).toISOString();
  const laufend = await db().from("auftraege").select("id", { count: "exact", head: true }).eq("owner", owner).eq("intern", true).gte("erstellt", seit);
  if (!sofort && laufend.count) return;
  await db().from("auftraege").insert({
    owner, intern: true,
    prompt: `Es gibt ${unklar.count} Buchungen ohne Erklärung. Hole sie mit dem Werkzeug buchungen (unklar, max 40) und erkläre jede mit „erklaere“ in einem Satz (Bereich, Kategorie). Prüfe vorher das Wissensregister. Wenn dir regelmäßige Zahlungen auffallen, die noch kein Vertrag sind, lege dafür einen Vorschlag (typ vertrag) an. Antworte am Ende mit einer Zeile Zusammenfassung.`,
  });
}

// Abrufe -----------------------------------------------------------------------------------
async function abruf(name: string, f: () => Promise<string>) {
  try {
    const r = await f();
    if (r !== "aus") log(`Abruf ${name}:`, r);
  } catch (e) {
    log(`Abruf ${name} fehlgeschlagen:`, e instanceof Error ? e.message : e);
  }
}

// Sicherung ------------------------------------------------------------------------------------
const TABELLEN = ["konten", "buchungen", "vertraege", "planposten", "verbindlichkeiten", "fristen", "freigaben", "auftraege", "toepfe", "regeln"];
async function sicherung() {
  if (!config.sicherungDir) return;
  mkdirSync(config.sicherungDir, { recursive: true, mode: 0o700 });
  const daten: Record<string, unknown[]> = {};
  for (const t of TABELLEN) {
    const zeilen: unknown[] = [];
    for (let von = 0; ; von += 1000) {
      const r = await db().from(t).select("*").eq("owner", owner).range(von, von + 999);
      if (r.error) throw new Error(`Sicherung ${t}: ${r.error.message}`);
      zeilen.push(...r.data);
      if (r.data.length < 1000) break;
    }
    daten[t] = zeilen;
  }
  const datei = join(config.sicherungDir, `zentrale-${heute()}.json`);
  writeFileSync(datei, JSON.stringify({ stand: new Date().toISOString(), daten }), { mode: 0o600 });
  // 30 Tage aufheben
  const alle = readdirSync(config.sicherungDir).filter((n) => /^zentrale-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
  for (const alt of alle.slice(0, Math.max(0, alle.length - 30))) rmSync(join(config.sicherungDir, alt));
  log("Sicherung", datei);
}

// Takt -------------------------------------------------------------------------------------------
function alle(ms: number, name: string, f: () => Promise<void>, sofort = true) {
  let laeuft = false;
  const lauf = async () => {
    if (laeuft) return;
    laeuft = true;
    try { await f(); } catch (e) { log(`${name}:`, e instanceof Error ? e.message : e); } finally { laeuft = false; }
  };
  if (sofort) void lauf();
  setInterval(lauf, ms);
}

/** Einmal täglich zu einer festen Berliner Uhrzeit. */
function taeglich(stunde: number, minute: number, name: string, f: () => Promise<void>) {
  let zuletzt = "";
  alle(60_000, name, async () => {
    const jetzt = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    const [h, m] = jetzt.split(":").map(Number);
    if (zuletzt !== heute() && (h! > stunde || (h === stunde && m! >= minute))) {
      zuletzt = heute();
      await f();
    }
  });
}

log("Zentrale-Engine startet");
alle(4_000, "Aufträge", auftraege);
alle(4_000, "Freigaben", freigaben);
alle(60_000, "Freigaben melden", neueFreigabenMelden);
alle(30 * 60_000, "Warnungen", warnungenMelden);
alle(15 * 60_000, "Smoobu/Qonto", async () => { await abruf("Smoobu", rufeSmoobuAb); await abruf("Qonto", rufeQontoAb); });
// Banken erlauben ohne Zutun nur wenige Abrufe am Tag
alle(6 * 3600_000, "FinTS", () => abruf("FinTS", () => rufeFintsAb()));
alle(10 * 60_000, "Unklare Buchungen", () => unklareErklaeren(), false);
taeglich(6, 30, "Morgenrunde", morgenrunde);
taeglich(3, 0, "Sicherung", sicherung);
