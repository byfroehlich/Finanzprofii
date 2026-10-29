import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { AuftragSchritt } from "@zentrale/core";
import { config } from "./config.ts";
import { db } from "./db.ts";

const MCP = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "zentrale-mcp.mjs");

export const SYSTEMPROMPT = `Du bist Claude in der „Zentrale“, der Finanz-Fernbedienung von Mathias. Er schreibt dir vom iPhone.

Regeln:
- Knapp, deutsch, ehrlich, ohne Schönfärberei. Antworten passen auf einen Handybildschirm: höchstens 5 kurze Sätze, Zahlen gerundet auf volle Euro, außer bei Zahlungen.
- Keine Vermutungen als Fakten. Erst nachsehen, dann sagen. Deine Datenquellen sind die Werkzeuge der Zentrale (mcp__zentrale__…) und die Dateien in diesem Ordner.
- Lies vor Aussagen zu Geld, Verträgen oder Steuern das Wissensregister (_Wissen/wissensregister.json) und REGELN.md, falls vorhanden.
- Gesamtbild vor Empfehlung, Liquidität vor Steuervorteil. Offene Posten nicht nur als „offen“ melden, sondern einplanen: wann, von welchem Konto.
- Persönliche Regeln, Anteile und Besonderheiten stehen in REGELN.md und im Wissensregister, nicht hier.
- Du führst nichts selbst aus. Du schlägst vor, Mathias bestätigt in der App, dann führt die Zentrale aus. Jeden Vorschlag, der etwas verändert (Zahlung, Mail, Termin, Einplanung, Vertrag), legst du mit dem Werkzeug „vorschlag“ an – mit konkretem Betrag, Konto und Datum und einer Begründung aus dem Gesamtbild.
- Zahlungen bereitest du nur vor; bestätigt werden sie in der Bank-App. Senden, Zahlen, Löschen und alles Unumkehrbare nur nach Freigabe.
- Unklare Buchungen erklärst du mit dem Werkzeug „erklaere“ in einem Satz: was ist passiert, wofür.
- Am Ende eine kurze Antwort an Mathias. Wenn du Vorschläge angelegt hast, sag in einem Satz, was in der App auf ihn wartet.`;

const SCHRITTE: Record<string, string> = {
  stand: "Liest Kontostände",
  prognose: "Rechnet die nächsten Monate",
  buchungen: "Liest Umsätze",
  vertraege: "Prüft wiederkehrende Zahlungen",
  offen: "Prüft offene Posten",
  fristen: "Prüft Fristen",
  toepfe: "Prüft Rücklagen",
  leisten: "Spielt die Ausgabe durch",
  erkennen: "Sucht regelmäßige Zahlungen",
  erklaere: "Ordnet eine Buchung ein",
  vorschlag: "Legt einen Vorschlag an",
};

/** Werkzeugaufruf → kurzer Schritt für die Aktivitätsanzeige. */
export function schrittText(name: string, input: Record<string, unknown>): string {
  const m = /^mcp__zentrale__(\w+)$/.exec(name);
  if (m) {
    if (m[1] === "buchungen" && input.unklar === true) return "Sucht unklare Buchungen";
    if (m[1] === "buchungen" && input.suche) return `Sucht „${String(input.suche).slice(0, 24)}“`;
    return SCHRITTE[m[1]!] ?? "Arbeitet mit der Zentrale";
  }
  if (name === "Read") return `Liest ${basename(String(input.file_path ?? "Datei"))}`;
  if (name === "Grep" || name === "Glob") return "Sucht im Wissen";
  return "Arbeitet";
}

export interface Lauf {
  antwort: string;
  sitzung: string | null;
  fehler: boolean;
}

/** Einen Auftrag mit Claude Code (Abo) ausführen. Claude darf nur lesen und Vorschläge anlegen. */
export async function claudeLauf(
  auftragId: string,
  prompt: string,
  fortsetzen: string | null,
  beiSchritt: (schritte: AuftragSchritt[]) => void,
): Promise<Lauf> {
  const cwd = config.wissenDir && existsSync(config.wissenDir) ? config.wissenDir : process.cwd();
  // Nur die Werkzeuge der Zentrale. Keine Shell: Bash-Regeln wie Bash(zentrale:*) lassen sich
  // mit „;“ umgehen (getestet), deshalb läuft alles über einen eigenen MCP-Server.
  const mcp = { mcpServers: { zentrale: { command: process.execPath, args: [MCP], env: { ZENTRALE_AUFTRAG: auftragId } } } };
  const args = [
    "-p",
    "--output-format", "stream-json", "--verbose",
    // Keine Einstellungen, Hooks oder fremden MCP-Server; Dateien nur im Wissensordner
    "--restricted", "--strict-mcp-config", "--mcp-config", JSON.stringify(mcp),
    "--tools", "Read,Grep,Glob",
    "--allowedTools", "mcp__zentrale", "Read", "Grep", "Glob",
    "--permission-mode", "dontAsk",
    "--append-system-prompt", SYSTEMPROMPT,
    // Neue Läufe bekommen eine eigene Sitzung, „Ändern“ setzt die alte fort
    ...(fortsetzen ? ["--resume", fortsetzen] : ["--session-id", randomUUID()]),
  ];
  const kind = spawn(config.claudeBin, args, {
    cwd,
    env: { ...process.env, ZENTRALE_AUFTRAG: auftragId },
    stdio: ["pipe", "pipe", "pipe"],
  });
  kind.stdin.end(prompt);

  const schritte: AuftragSchritt[] = [];
  let sitzung: string | null = fortsetzen;
  let antwort = "";
  let fehler = false;
  let puffer = "";
  let stderr = "";

  const zeit = setTimeout(() => kind.kill("SIGTERM"), 10 * 60_000);
  kind.stderr.on("data", (d: Buffer) => { stderr = (stderr + d.toString()).slice(-4000); });
  kind.stdout.on("data", (d: Buffer) => {
    puffer += d.toString();
    let i: number;
    while ((i = puffer.indexOf("\n")) >= 0) {
      const zeile = puffer.slice(0, i).trim();
      puffer = puffer.slice(i + 1);
      if (!zeile) continue;
      let e: Record<string, any>;
      try { e = JSON.parse(zeile); } catch { continue; }
      if (e.type === "system" && e.subtype === "init" && e.session_id) sitzung = e.session_id;
      if (e.type === "assistant" && Array.isArray(e.message?.content)) {
        for (const c of e.message.content) {
          if (c.type !== "tool_use") continue;
          const text = schrittText(c.name, c.input ?? {});
          for (const s of schritte) s.status = "fertig";
          if (schritte[schritte.length - 1]?.text !== text) schritte.push({ text, status: "laeuft" });
          else schritte[schritte.length - 1]!.status = "laeuft";
          beiSchritt([...schritte]);
        }
      }
      if (e.type === "result") {
        antwort = String(e.result ?? "");
        fehler = Boolean(e.is_error) || e.subtype !== "success";
        if (e.session_id) sitzung = e.session_id;
      }
    }
  });

  const code: number = await new Promise((ok) => kind.on("close", (c) => ok(c ?? 1)));
  clearTimeout(zeit);
  for (const s of schritte) s.status = "fertig";
  beiSchritt([...schritte]);
  if (!antwort) {
    fehler = true;
    antwort = code === 0 ? "Keine Antwort erhalten." : `Claude ist abgebrochen (Code ${code}). ${stderr.split("\n").filter(Boolean).slice(-2).join(" ")}`.trim();
  }
  return { antwort, sitzung, fehler };
}

/** Auftrag aus der Datenbank abarbeiten und Fortschritt live zurückschreiben. */
export async function bearbeiteAuftrag(a: { id: string; prompt: string; bezug: string | null }): Promise<void> {
  let fortsetzen: string | null = null;
  if (a.bezug) {
    const r = await db().from("auftraege").select("sitzung").eq("id", a.bezug).eq("owner", config.owner()).maybeSingle();
    fortsetzen = (r.data?.sitzung as string | null) ?? null;
  }
  let letzteSchreibung = 0;
  let ausstehend: AuftragSchritt[] | null = null;
  const schreibe = async (s: AuftragSchritt[]) => {
    await db().from("auftraege").update({ schritte: s }).eq("id", a.id);
  };
  const lauf = await claudeLauf(a.id, a.prompt, fortsetzen, (s) => {
    // höchstens alle 700 ms schreiben, sonst flackert die App
    ausstehend = s;
    const jetzt = Date.now();
    if (jetzt - letzteSchreibung > 700) {
      letzteSchreibung = jetzt;
      void schreibe(s);
      ausstehend = null;
    }
  });
  if (ausstehend) await schreibe(ausstehend);
  await db().from("auftraege").update({
    status: lauf.fehler ? "fehler" : "fertig",
    antwort: lauf.antwort,
    sitzung: lauf.sitzung,
    fertig: new Date().toISOString(),
  }).eq("id", a.id);
}
