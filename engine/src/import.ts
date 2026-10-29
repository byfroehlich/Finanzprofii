import {
  einordnen, mitFingerabdruck, naechsterTerminNach, passenderPlanposten, saldoAusExport,
  type Cent, type Datum, type RohBuchung,
} from "@zentrale/core";
import { config } from "./config.ts";
import { db, ladeBestand, ladeRegeln, pruefe } from "./db.ts";

export interface SpeicherErgebnis {
  neu: number;
  doppelt: number;
  /** Ohne Vertrag/Regel – die erklärt Claude. */
  unklar: number;
  saldo: { saldo: Cent; datum: Datum } | null;
}

/**
 * Buchungen eines Kontos speichern: doppelte überspringen, einordnen,
 * Verträge und geplante Posten abhaken, Kontostand nachziehen.
 */
export async function speichereBuchungen(
  kontoId: string,
  liste: RohBuchung[],
  quelle: string,
  saldo?: { saldo: Cent; datum: Datum } | null,
): Promise<SpeicherErgebnis> {
  const owner = config.owner();
  const bestand = await ladeBestand("2999-01-01");
  if (!bestand.konten.some((k) => k.id === kontoId)) throw new Error(`Konto „${kontoId}“ gibt es nicht`);
  const regeln = await ladeRegeln();
  const vertraege = bestand.vertraege;
  const offenePosten = [...bestand.planposten];

  const zeilen = mitFingerabdruck(kontoId, liste).map((b) => {
    const e = einordnen({ ...b, kontoId }, vertraege, regeln);
    return {
      owner, konto_id: kontoId, datum: b.datum, betrag: b.betrag, gegenpartei: b.gegenpartei, zweck: b.zweck,
      fingerabdruck: b.fingerabdruck, quelle,
      bereich: e?.bereich ?? null, kategorie: e?.kategorie ?? null, erklaerung: e?.erklaerung ?? null,
      vertrag_id: e?.vertragId ?? null, eingeordnet_von: e?.quelle ?? null,
    };
  });

  // Nur tatsächlich neu eingefügte Zeilen kommen zurück
  const neu: { id: string; datum: Datum; betrag: Cent; vertrag_id: string | null; erklaerung: string | null }[] = [];
  for (let i = 0; i < zeilen.length; i += 500) {
    const r = await db().from("buchungen")
      .upsert(zeilen.slice(i, i + 500), { onConflict: "konto_id,fingerabdruck", ignoreDuplicates: true })
      .select("id, datum, betrag, vertrag_id, erklaerung");
    neu.push(...pruefe(r, "Buchungen speichern"));
  }

  // Verträge weiterschieben, geplante Posten erledigen (älteste zuerst)
  for (const b of [...neu].sort((x, y) => (x.datum < y.datum ? -1 : 1))) {
    if (b.vertrag_id) {
      const v = vertraege.find((x) => x.id === b.vertrag_id)!;
      const weiter = naechsterTerminNach(v, b.datum);
      if (weiter) {
        v.naechsteFaelligkeit = weiter;
        await db().from("vertraege").update({ naechste_faelligkeit: weiter }).eq("id", v.id).eq("owner", owner);
      }
    } else {
      const p = passenderPlanposten(offenePosten, { kontoId, datum: b.datum, betrag: b.betrag });
      if (p) {
        p.status = "erledigt";
        await db().from("planposten").update({ status: "erledigt", buchung_id: b.id }).eq("id", p.id).eq("owner", owner);
      }
    }
  }

  const neuerSaldo = saldo ?? saldoAusExport(liste);
  const konto = bestand.konten.find((k) => k.id === kontoId)!;
  if (neuerSaldo && neuerSaldo.datum >= konto.saldoDatum) {
    await db().from("konten").update({ saldo: neuerSaldo.saldo, saldo_datum: neuerSaldo.datum, aktualisiert: new Date().toISOString() }).eq("id", kontoId).eq("owner", owner);
  }

  return {
    neu: neu.length,
    doppelt: zeilen.length - neu.length,
    unklar: neu.filter((b) => !b.erklaerung).length,
    saldo: neuerSaldo,
  };
}
