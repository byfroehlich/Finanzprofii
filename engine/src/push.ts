import webpush from "web-push";
import { config } from "./config.ts";
import { db } from "./db.ts";

export interface Meldung {
  titel: string;
  text: string;
  /** Wohin die App beim Antippen springt, z. B. "#/freigaben" */
  ziel?: string;
}

/**
 * Push an alle Geräte. Mit `schluessel` wird jede Meldung nur einmal verschickt.
 * Gibt false zurück, wenn sie schon verschickt war oder Push nicht eingerichtet ist.
 */
export async function melde(m: Meldung, schluessel?: string): Promise<boolean> {
  const vapid = config.vapid;
  if (!vapid) return false;
  const owner = config.owner();
  if (schluessel) {
    const r = await db().from("meldungen").insert({ owner, schluessel });
    if (r.error) return false; // schon gemeldet (Primärschlüssel)
  }
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  const abos = (await db().from("push_abos").select("endpoint, p256dh, auth").eq("owner", owner)).data ?? [];
  await Promise.all(abos.map(async (a) => {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify(m), { TTL: 6 * 3600, urgency: "high" });
    } catch (e) {
      // Abgelaufene Abos aufräumen
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db().from("push_abos").delete().eq("endpoint", a.endpoint);
    }
  }));
  return true;
}
