// FinTS-Abruf über engine/fints/abruf.py (python-fints). Zugangsdaten liegen nur auf dem Server.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Cent, Datum } from "@zentrale/core";
import { config } from "../config.ts";
import { abrufStatus } from "../db.ts";
import { speichereBuchungen } from "../import.ts";
import { melde } from "../push.ts";

const SKRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fints", "abruf.py");

interface FintsKonto {
  kontoId: string;
  saldo: Cent;
  saldoDatum: Datum;
  buchungen: { datum: Datum; betrag: Cent; gegenpartei: string; zweck: string }[];
}

export async function rufeFintsAb(tage = 30): Promise<string> {
  if (!config.fintsConfig) return "aus";
  const python = process.env.FINTS_PYTHON ?? "python3";
  const kind = spawn(python, [SKRIPT, config.fintsConfig, "--tage", String(tage)], { stdio: ["ignore", "pipe", "pipe"] });
  let puffer = "";
  let konten: FintsKonto[] | null = null;
  let fehler = "";
  let stderr = "";
  kind.stderr.on("data", (d: Buffer) => { stderr = (stderr + d.toString()).slice(-2000); });
  kind.stdout.on("data", (d: Buffer) => {
    puffer += d.toString();
    let i: number;
    while ((i = puffer.indexOf("\n")) >= 0) {
      const zeile = puffer.slice(0, i);
      puffer = puffer.slice(i + 1);
      let e: { ereignis?: string; text?: string; konten?: FintsKonto[] };
      try { e = JSON.parse(zeile); } catch { continue; }
      if (e.ereignis === "bestaetigen") {
        void melde({ titel: "Bank wartet auf dich", text: "Bitte den Kontoabruf in der Banking-App bestätigen.", ziel: "#/" });
      } else if (e.ereignis === "fertig") konten = e.konten ?? [];
      else if (e.ereignis === "fehler") fehler = e.text ?? "Unbekannter Fehler";
    }
  });
  const code: number = await new Promise((ok) => kind.on("close", (c) => ok(c ?? 1)));
  try {
    if (!konten) throw new Error(fehler || `FinTS-Abruf beendet mit Code ${code}. ${stderr.trim().split("\n").at(-1) ?? ""}`);
    const teile: string[] = [];
    for (const k of konten as FintsKonto[]) {
      const r = await speichereBuchungen(k.kontoId, k.buchungen.map((b, i) => ({ ...b, waehrung: "EUR", saldoNach: null, zeile: i + 1 })), "fints", { saldo: k.saldo, datum: k.saldoDatum });
      teile.push(`${k.kontoId}: ${r.neu} neu`);
    }
    const text = teile.join(", ") || "keine Konten zugeordnet";
    await abrufStatus("fints", true, text);
    return text;
  } catch (e) {
    await abrufStatus("fints", false, e instanceof Error ? e.message : String(e));
    throw e;
  }
}
