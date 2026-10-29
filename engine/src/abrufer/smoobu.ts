// Smoobu (Channel-Manager für Airbnb/Booking): An-/Abreisen und erwartete Auszahlungen.
// API: https://docs.smoobu.com – Header "Api-Key". Ungetestet ohne echten Schlüssel.
import { heute, plusTage, tageZwischen, zuDate, type Datum, type Frist, type Planposten } from "@zentrale/core";
import { config } from "../config.ts";
import { abrufStatus, db, pruefe } from "../db.ts";

export interface SmoobuBuchung {
  id: number;
  type?: string;
  arrival: string;
  departure: string;
  apartment?: { id: number; name: string };
  channel?: { id: number; name: string };
  "guest-name"?: string;
  price?: number | string | null;
  "is-blocked-booking"?: boolean;
}

export interface Auszahlungsregeln {
  /** Anteil vom Gästepreis, der ausgezahlt wird (nach Provisionen). */
  anteil: Record<"airbnb" | "booking" | "direkt", number>;
  /** Ein bekannter Booking-Auszahlungsfreitag; danach alle 14 Tage. */
  bookingAnker: Datum | null;
}

export const STANDARD_REGELN: Auszahlungsregeln = {
  // Grobe Annahmen, bis echte Auszahlungen vorliegen – in engine/.env anpassbar
  anteil: { airbnb: 0.97, booking: 0.82, direkt: 1 },
  bookingAnker: null,
};

function kanal(b: SmoobuBuchung): "airbnb" | "booking" | "direkt" {
  const n = (b.channel?.name ?? "").toLowerCase();
  if (n.includes("airbnb")) return "airbnb";
  if (n.includes("booking")) return "booking";
  return "direkt";
}

/** Nächster Booking-Auszahlungsfreitag nach der Abreise. */
export function bookingAuszahlung(abreise: Datum, anker: Datum | null): Datum {
  let d = plusTage(abreise, 1);
  while (zuDate(d).getUTCDay() !== 5) d = plusTage(d, 1);
  if (anker) {
    // auf den 14-Tage-Takt ab dem Anker legen
    const versatz = ((tageZwischen(anker, d) % 14) + 14) % 14;
    if (versatz !== 0) d = plusTage(d, 14 - versatz);
  }
  return d;
}

export interface SmoobuPlan {
  fristen: (Frist & { quelle: "smoobu" })[];
  posten: (Omit<Planposten, "id"> & { schluessel: string })[];
  storniert: number[];
}

/** Smoobu-Buchungen in Termine (An-/Abreise) und erwartete Auszahlungen übersetzen. */
export function smoobuZuPlan(buchungen: SmoobuBuchung[], kontoId: string, regeln: Auszahlungsregeln = STANDARD_REGELN): SmoobuPlan {
  const plan: SmoobuPlan = { fristen: [], posten: [], storniert: [] };
  for (const b of buchungen) {
    if (b["is-blocked-booking"]) continue;
    if ((b.type ?? "").toLowerCase().includes("cancel")) { plan.storniert.push(b.id); continue; }
    const wohnung = b.apartment?.name ?? "Wohnung";
    const gast = (b["guest-name"] ?? "Gast").trim();
    const k = kanal(b);
    plan.fristen.push(
      { id: `smoobu-${b.id}-an`, titel: `Anreise ${wohnung} · ${gast}`, datum: b.arrival, art: "anreise", bereich: "vermietung", erledigt: false, quelle: "smoobu" },
      { id: `smoobu-${b.id}-ab`, titel: `Abreise ${wohnung} · Reinigung`, datum: b.departure, art: "abreise", bereich: "vermietung", erledigt: false, quelle: "smoobu" },
    );
    const preis = Number(b.price ?? 0);
    if (preis > 0 && k !== "direkt") {
      const datum = k === "airbnb" ? plusTage(b.arrival, 1) : bookingAuszahlung(b.departure, regeln.bookingAnker);
      plan.posten.push({
        schluessel: `smoobu-${b.id}`, kontoId, datum, betrag: Math.round(preis * regeln.anteil[k] * 100),
        titel: `Auszahlung ${k === "airbnb" ? "Airbnb" : "Booking"} · ${wohnung}`,
        sicherheit: "wahrscheinlich", status: "geplant", bereich: "vermietung",
      });
    }
  }
  return plan;
}

async function holeAlle(apiKey: string, von: Datum, bis: Datum): Promise<SmoobuBuchung[]> {
  const alle: SmoobuBuchung[] = [];
  for (let seite = 1; seite <= 50; seite++) {
    const url = new URL("https://login.smoobu.com/api/reservations");
    url.search = new URLSearchParams({ arrivalFrom: von, arrivalTo: bis, showCancellation: "true", pageSize: "100", page: String(seite) }).toString();
    const r = await fetch(url, { headers: { "Api-Key": apiKey, "Cache-Control": "no-cache" } });
    if (!r.ok) throw new Error(`Smoobu antwortet ${r.status}`);
    const j = (await r.json()) as { bookings?: SmoobuBuchung[]; page_count?: number };
    alle.push(...(j.bookings ?? []));
    if (!j.page_count || seite >= j.page_count) break;
  }
  return alle;
}

export async function rufeSmoobuAb(): Promise<string> {
  const s = config.smoobu;
  if (!s) return "aus";
  if (!s.kontoId) throw new Error("SMOOBU_KONTO_ID fehlt (Konto, auf das ausgezahlt wird)");
  const owner = config.owner();
  try {
    const h = heute();
    const plan = smoobuZuPlan(await holeAlle(s.apiKey, plusTage(h, -30), plusTage(h, 400)), s.kontoId, {
      anteil: {
        airbnb: Number(process.env.SMOOBU_ANTEIL_AIRBNB ?? STANDARD_REGELN.anteil.airbnb),
        booking: Number(process.env.SMOOBU_ANTEIL_BOOKING ?? STANDARD_REGELN.anteil.booking),
        direkt: 1,
      },
      bookingAnker: process.env.SMOOBU_BOOKING_ANKER || null,
    });
    if (plan.fristen.length) pruefe(await db().from("fristen").upsert(plan.fristen.map((f) => ({ owner, ...f })), { onConflict: "id" }).select("id"), "Smoobu-Termine");
    // Bereits erledigte Auszahlungen (per Bankabgleich) nicht wieder öffnen
    for (const p of plan.posten) {
      const { schluessel, kontoId, ...rest } = p;
      const vorhanden = (await db().from("planposten").select("id, status").eq("owner", owner).eq("schluessel", schluessel).maybeSingle()).data;
      if (vorhanden && vorhanden.status !== "geplant") continue;
      const zeile = { owner, schluessel, konto_id: kontoId, datum: rest.datum, betrag: rest.betrag, titel: rest.titel, sicherheit: rest.sicherheit, status: "geplant", bereich: rest.bereich };
      pruefe(await (vorhanden ? db().from("planposten").update(zeile).eq("id", vorhanden.id) : db().from("planposten").insert(zeile)).select("id"), "Smoobu-Auszahlung");
    }
    for (const id of plan.storniert) {
      await db().from("planposten").update({ status: "verworfen" }).eq("owner", owner).eq("schluessel", `smoobu-${id}`).eq("status", "geplant");
      await db().from("fristen").delete().eq("owner", owner).in("id", [`smoobu-${id}-an`, `smoobu-${id}-ab`]);
    }
    const text = `${plan.fristen.length / 2} Buchungen, ${plan.posten.length} Auszahlungen, ${plan.storniert.length} Stornos`;
    await abrufStatus("smoobu", true, text);
    return text;
  } catch (e) {
    await abrufStatus("smoobu", false, e instanceof Error ? e.message : String(e));
    throw e;
  }
}
