import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ausZeile, type Bestand, type Regel } from "@zentrale/core";
import { config } from "./config.ts";

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  client ??= createClient(config.supabaseUrl(), config.serviceKey(), { auth: { persistSession: false } });
  return client;
}

/** Fehler aus Supabase in eine lesbare Ausnahme verwandeln. */
export function pruefe<T>(r: { data: T; error: { message: string } | null }, was: string): NonNullable<T> {
  if (r.error) throw new Error(`${was}: ${r.error.message}`);
  if (r.data == null) throw new Error(`${was}: keine Daten`);
  return r.data;
}

export async function ladeBestand(buchungenSeit?: string): Promise<Bestand> {
  const o = config.owner();
  const [konten, vertraege, planposten, buchungen, verbindlichkeiten, fristen, freigaben, toepfe] = await Promise.all([
    db().from("konten").select("*").eq("owner", o).order("sortierung"),
    db().from("vertraege").select("*").eq("owner", o),
    db().from("planposten").select("*").eq("owner", o).eq("status", "geplant"),
    db().from("buchungen").select("*").eq("owner", o).gte("datum", buchungenSeit ?? "1900-01-01").order("datum", { ascending: false }).limit(5000),
    db().from("verbindlichkeiten").select("*").eq("owner", o),
    db().from("fristen").select("*").eq("owner", o).eq("erledigt", false),
    db().from("freigaben").select("*").eq("owner", o).in("status", ["offen", "spaeter"]),
    db().from("toepfe").select("*").eq("owner", o).order("prioritaet", { ascending: false }),
  ]);
  return {
    konten: pruefe(konten, "Konten").map(ausZeile.konto),
    vertraege: pruefe(vertraege, "Verträge").map(ausZeile.vertrag),
    planposten: pruefe(planposten, "Planposten").map(ausZeile.planposten),
    buchungen: pruefe(buchungen, "Buchungen").map(ausZeile.buchung),
    verbindlichkeiten: pruefe(verbindlichkeiten, "Verbindlichkeiten").map(ausZeile.verbindlichkeit),
    fristen: pruefe(fristen, "Fristen").map(ausZeile.frist),
    freigaben: pruefe(freigaben, "Freigaben").map(ausZeile.freigabe),
    toepfe: pruefe(toepfe, "Töpfe").map(ausZeile.topf),
    stand: new Date().toISOString(),
  };
}

export async function ladeRegeln(): Promise<Regel[]> {
  return pruefe(await db().from("regeln").select("*").eq("owner", config.owner()), "Regeln").map(ausZeile.regel);
}

export async function abrufStatus(quelle: string, erfolg: boolean, meldung = ""): Promise<void> {
  const jetzt = new Date().toISOString();
  await db().from("abrufe").upsert({
    owner: config.owner(), quelle, letzter_versuch: jetzt, meldung,
    ...(erfolg ? { letzter_erfolg: jetzt } : {}),
  });
}
