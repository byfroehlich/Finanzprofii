import "./stil.css";
import { gehe, hinweis, rechne, type Seite, type Zustand } from "./app.ts";
import { demoQuelle } from "./daten/demo.ts";
import { supabaseQuelle } from "./daten/supabase.ts";
import { html } from "./html.ts";
import { orbBinden } from "./orb.ts";
import { anmelden } from "./seiten/anmelden.ts";
import { offen, vermietung } from "./seiten/bereiche.ts";
import { claudeAuftrag, claudeNeu } from "./seiten/claude.ts";
import { konten, konto } from "./seiten/konten.ts";
import { start } from "./seiten/start.ts";
import { steuerung } from "./seiten/steuerung.ts";
import { wuensche } from "./seiten/wuensche.ts";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const wurzel = document.getElementById("app")!;

const ROUTEN: [RegExp, Seite][] = [
  [/^\/$/, start],
  [/^\/konten$/, konten],
  [/^\/konto\/([\w-]+)$/, konto],
  [/^\/claude$/, claudeNeu],
  [/^\/claude\/([\w-]+)$/, claudeAuftrag],
  [/^\/wuensche$/, wuensche],
  [/^\/offen$/, offen],
  [/^\/vermietung$/, vermietung],
  [/^\/steuerung$/, steuerung],
  [/^\/anmelden$/, anmelden],
];

const z: Zustand = {
  quelle: url && anon ? supabaseQuelle(url, anon) : demoQuelle(),
  ansicht: null,
  prognose: null,
  fehler: null,
  karte: 0,
  pulsKonto: null,
  neuZeichnen: () => void zeichne(false),
  neuLaden: async () => { await laden(); await zeichne(false); },
};

let aufraeumen: (() => void) | void;
let aktuell: { seite: Seite; parameter: string[] } | null = null;
let zeichnet = 0;

function finde(): { seite: Seite; parameter: string[] } {
  const pfad = location.hash.replace(/^#/, "") || "/";
  for (const [muster, seite] of ROUTEN) {
    const m = muster.exec(pfad);
    if (m) return { seite, parameter: m.slice(1) };
  }
  return { seite: start, parameter: [] };
}

async function laden() {
  try {
    z.ansicht = await z.quelle.lade();
    z.fehler = null;
    rechne(z);
  } catch (e) {
    z.fehler = e instanceof Error ? e.message : String(e);
  }
}

async function zeichne(neueSeite: boolean) {
  const nr = ++zeichnet;
  const ziel = finde();
  if (ziel.seite !== anmelden && z.quelle.art === "supabase" && !(await z.quelle.angemeldet())) {
    gehe("#/anmelden");
    return;
  }
  if (!z.ansicht && ziel.seite !== anmelden) await laden();
  if (!z.ansicht && ziel.seite !== anmelden) {
    wurzel.innerHTML = html`<div class="seite" style="min-height:80dvh;justify-content:center"><div class="glas karte"><span class="etikett">Keine Verbindung</span><span class="karten-text">${z.fehler ?? "Unbekannter Fehler"}</span><button type="button" class="knopf-haupt" data-tun="nochmal">Nochmal</button></div></div>`.s;
    return;
  }
  const inhalt = await ziel.seite.rendern(z, ziel.parameter);
  if (nr !== zeichnet) return; // inzwischen neuer Aufruf
  // Scrollposition behalten, wenn dieselbe Seite neu gezeichnet wird
  const y = neueSeite ? 0 : window.scrollY;
  if (typeof aufraeumen === "function") aufraeumen();
  wurzel.innerHTML = inhalt.s;
  if (!neueSeite) wurzel.querySelector(".seite")?.setAttribute("style", (wurzel.querySelector(".seite")?.getAttribute("style") ?? "") + ";animation:none");
  window.scrollTo(0, y);
  aktuell = ziel;
  const weg1 = ziel.seite.danach?.(wurzel, z, ziel.parameter);
  const weg2 = orbBinden(wurzel, z);
  aufraeumen = () => { if (typeof weg1 === "function") weg1(); if (typeof weg2 === "function") weg2(); };
}

// Ein Klick-Verteiler für alle Seiten: data-tun="name"
wurzel.addEventListener("click", async (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tun]");
  if (!el) return;
  if (el.dataset.tun === "nochmal") { await z.neuLaden(); return; }
  const f = aktuell?.seite.tun?.[el.dataset.tun!];
  if (!f) return;
  e.preventDefault();
  let neu = true;
  try {
    neu = (await f(el, z, aktuell!.parameter)) !== false;
  } catch (err) {
    hinweis(err instanceof Error ? err.message : "Hat nicht geklappt");
  }
  if (neu) await zeichne(false);
});

window.addEventListener("hashchange", () => void zeichne(true));

// Live: bei Änderungen in der Datenbank neu laden – aber nicht mitten im Tippen
z.quelle.beobachte(async () => {
  await laden();
  const tippt = document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
  if (!tippt) await zeichne(false);
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

void zeichne(true);
