import { randomUUID } from "node:crypto";
import { euro, kurzesDatum, pruefeAktion, zuZeile, type Aktion } from "@zentrale/core";
import { config } from "./config.ts";
import { db, pruefe } from "./db.ts";
import { sendeMail } from "./mail.ts";

/** Führt eine freigegebene Aktion aus. Gibt eine kurze Rückmeldung für die App zurück. */
export async function fuehreAus(aktion: Aktion): Promise<string> {
  // Auch gespeicherte Aktionen noch einmal prüfen – die Datenbank ist keine Vertrauensgrenze
  const p = pruefeAktion(aktion);
  if (!p.ok) throw new Error(p.fehler);
  const a = p.aktion;
  const owner = config.owner();

  switch (a.typ) {
    case "planposten": {
      pruefe(await db().from("planposten").insert({ owner, ...zuZeile.planposten({ ...a.posten, status: "geplant" }) }).select("id"), "Einplanen");
      return `Eingeplant am ${kurzesDatum(a.posten.datum)}.`;
    }
    case "zahlung_vorbereiten": {
      // Es wird kein Geld bewegt. Die Zahlung landet im Plan; bestätigt wird in der Bank-App.
      const konto = pruefe(await db().from("konten").select("bereich").eq("id", a.kontoId).eq("owner", owner).single(), "Konto");
      pruefe(await db().from("planposten").insert({
        owner, konto_id: a.kontoId, datum: a.datum, betrag: -Math.abs(a.betrag), titel: `Überweisung an ${a.empfaenger}`,
        sicherheit: "sicher", status: "geplant", bereich: konto.bereich,
      }).select("id"), "Zahlung einplanen");
      return `Eingeplant. Bitte in der Bank-App überweisen: ${euro(a.betrag)} an ${a.empfaenger}${a.iban ? `, ${a.iban}` : ""}, Zweck „${a.zweck}“.`;
    }
    case "mail": {
      await sendeMail(a.an, a.betreff, a.text);
      return `Mail an ${a.an} gesendet.`;
    }
    case "frist": {
      pruefe(await db().from("fristen").insert({ owner, ...zuZeile.frist({ ...a.frist, id: `f-${randomUUID().slice(0, 8)}`, erledigt: false }), quelle: "claude" }).select("id"), "Termin");
      return `Eingetragen für ${kurzesDatum(a.frist.datum)}.`;
    }
    case "vertrag": {
      pruefe(await db().from("vertraege").upsert({ owner, ...zuZeile.vertrag(a.vertrag) }).select("id"), "Vertrag");
      return "Gespeichert, die Prognose rechnet damit.";
    }
    case "verbindlichkeit": {
      pruefe(await db().from("verbindlichkeiten").upsert({ owner, ...zuZeile.verbindlichkeit(a.verbindlichkeit) }).select("id"), "Offener Posten");
      return "Gespeichert.";
    }
    case "claude": {
      pruefe(await db().from("auftraege").insert({ owner, prompt: a.auftrag, intern: true }).select("id"), "Auftrag");
      return "Auftrag an Claude übergeben.";
    }
    case "notiz":
      return "Notiert.";
  }
}
