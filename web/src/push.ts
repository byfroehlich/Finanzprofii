import type { Datenquelle } from "./daten/quelle.ts";

export type PushStatus = "an" | "aus" | "gesperrt" | "nicht-moeglich";

export async function pushStatus(): Promise<PushStatus> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "nicht-moeglich";
  if (Notification.permission === "denied") return "gesperrt";
  const reg = await navigator.serviceWorker.getRegistration();
  const abo = await reg?.pushManager.getSubscription();
  return abo && Notification.permission === "granted" ? "an" : "aus";
}

function schluessel(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const roh = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(roh.length));
  for (let i = 0; i < roh.length; i++) out[i] = roh.charCodeAt(i);
  return out;
}

/** Muss aus einem Tipp heraus aufgerufen werden (iOS verlangt eine Nutzeraktion). */
export async function pushEinschalten(quelle: Datenquelle): Promise<void> {
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapid) throw new Error("Push ist auf dem Server noch nicht eingerichtet.");
  if ((await pushStatus()) === "nicht-moeglich") throw new Error("Erst „Zum Home-Bildschirm“ hinzufügen, dann gehen Mitteilungen.");
  const erlaubnis = await Notification.requestPermission();
  if (erlaubnis !== "granted") throw new Error("Mitteilungen wurden nicht erlaubt.");
  const reg = await navigator.serviceWorker.ready;
  const abo = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: schluessel(vapid) }));
  await quelle.pushSpeichern(abo.toJSON(), navigator.userAgent.includes("iPhone") ? "iPhone" : "Browser");
}
