import { gehe, hinweis, type Seite } from "../app.ts";
import { html } from "../html.ts";
import { pushStatus, pushEinschalten } from "../push.ts";
import { sym } from "../symbole.ts";
import { kopfZurueck } from "./konten.ts";

const QUELLEN: Record<string, string> = { fints: "Bank (FinTS)", smoobu: "Smoobu", qonto: "Qonto", mail: "Mail" };

function zeit(iso: string | null) {
  if (!iso) return "noch nie";
  const d = new Date(iso);
  const heute = new Date().toDateString() === d.toDateString();
  return heute ? d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("de-DE", { day: "numeric", month: "numeric" }) + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export const steuerung: Seite = {
  async rendern(z) {
    const a = z.ansicht!;
    const push = await pushStatus();
    const installiert = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    return html`
<div class="seite">
  ${kopfZurueck("Steuerung")}
  ${installiert ? "" : html`
  <section class="glas karte">
    <span class="etikett">Auf den Home-Bildschirm</span>
    <span class="karten-text">In Safari unten auf Teilen tippen, dann „Zum Home-Bildschirm“. Erst dann gehen Mitteilungen, und die Zentrale öffnet im Vollbild.</span>
  </section>`}
  <section class="glas karte">
    <div style="display:flex;align-items:center;gap:12px">
      <div class="rundknopf" style="background:linear-gradient(135deg,#FFD3B6,#FF8A5B)">${sym.glocke()}</div>
      <div style="flex:1;display:flex;flex-direction:column"><span style="font-size:16px;font-weight:500">Mitteilungen</span><span class="leise">${push === "an" ? "An. Freigaben, Warnungen und Claude melden sich." : push === "gesperrt" ? "In den iPhone-Einstellungen gesperrt." : push === "nicht-moeglich" ? "Erst nach „Zum Home-Bildschirm“ möglich." : "Aus"}</span></div>
      ${push === "aus" ? html`<button type="button" class="knopf-klein" style="background:rgba(255,255,255,.9);color:#0B0C12;font-weight:600" data-tun="push">Einschalten</button>` : ""}
    </div>
  </section>
  <section class="glas karte">
    <span class="etikett">Quellen</span>
    <div class="liste">
      ${a.abrufe.length ? a.abrufe.map((q) => {
        const ok = q.letzterErfolg && q.letzterErfolg === q.letzterVersuch;
        return html`<div class="eintrag"><span class="lampe ${ok ? "" : "gelb"}" style="margin-top:7px"></span><div class="mitte"><span class="name">${QUELLEN[q.quelle] ?? q.quelle}</span><span class="erklaerung">${ok ? `Zuletzt ${zeit(q.letzterErfolg)}` : `Hakt seit ${zeit(q.letzterVersuch)}`}${q.meldung ? ` · ${q.meldung}` : ""}</span></div></div>`;
      }) : html`<span class="leer">Noch keine automatischen Abrufe. Kontoauszüge kommen bis dahin per CSV-Import.</span>`}
    </div>
  </section>
  <section class="glas karte ausgegraut" aria-disabled="true">
    <div style="display:flex;align-items:center;gap:12px">
      <div class="rundknopf glas">${sym.mac()}</div>
      <div style="flex:1;display:flex;flex-direction:column"><span style="font-size:16px;font-weight:500">Mac mini</span><span class="leise">Folgt. Dann hier: wach halten, aufwecken, Portale.</span></div>
    </div>
    <div class="schalter"><button type="button" aria-pressed="false">Aus</button><button type="button" aria-pressed="false">1 Std.</button><button type="button" aria-pressed="false">4 Std.</button><button type="button" aria-pressed="false">Immer</button></div>
  </section>
  ${z.quelle.art === "supabase" ? html`<button type="button" class="knopf glas" data-tun="abmelden">${sym.aus()} Abmelden</button>` : html`<p class="hinweis">Beispieldaten · keine Verbindung zur Datenbank</p>`}
</div>`;
  },
  tun: {
    push: async (_el, z) => {
      try {
        await pushEinschalten(z.quelle);
        hinweis("Mitteilungen sind an.");
      } catch (e) {
        hinweis(e instanceof Error ? e.message : "Ging nicht");
      }
      z.neuZeichnen();
    },
    abmelden: async (_el, z) => {
      await z.quelle.abmelden();
      gehe("#/anmelden");
    },
  },
};
