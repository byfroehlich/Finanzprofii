import { beschreibeAktion, type Freigabe } from "@zentrale/core";
import { gehe, hinweis, type Seite, type Zustand } from "../app.ts";
import { html } from "../html.ts";
import { sym } from "../symbole.ts";
import { kopfZurueck } from "./konten.ts";

const VORSCHLAEGE = [
  "Wie stehe ich gerade?",
  "Kann ich mir 1.800 € leisten?",
  "Plane meine Rückstände ein.",
  "Was kommt diese Woche?",
];

function eingabe(platzhalter: string, bezug: string | null, knopf = "Senden") {
  return html`
<form class="glas karte" data-form="auftrag" ${bezug ? html`data-bezug="${bezug}"` : ""}>
  <label class="versteckt" for="auftrag-text">Auftrag an Claude</label>
  <textarea id="auftrag-text" class="feld" name="text" rows="3" placeholder="${platzhalter}" enterkeyhint="send" autocomplete="off"></textarea>
  <div class="knopfreihe"><button type="submit" class="knopf-haupt">${sym.senden()} ${knopf}</button></div>
  <span class="leise">Sprechen: Mikrofon auf der Tastatur oder Orb auf der Startseite halten.</span>
</form>`;
}

function freigabeKarte(f: Freigabe, z: Zustand) {
  const kontoName = (id: string) => z.ansicht?.konten.find((k) => k.id === id)?.name ?? id;
  const entschieden = f.status !== "offen" && f.status !== "spaeter";
  return html`
<div class="antwort">
  <span style="font-weight:500">${f.titel}</span>
  ${f.text ? html`<span class="mittel" style="font-size:14px">${f.text}</span>` : ""}
  <span class="aktion">${beschreibeAktion(f.aktion, kontoName)}</span>
  ${entschieden
    ? html`<span style="color:${f.status === "fehler" ? "var(--rot)" : "var(--minze)"};font-size:14px">${f.status === "abgelehnt" ? "Abgelehnt." : f.ergebnis ?? "Freigegeben."}</span>`
    : html`<div class="knopfreihe">
      <button type="button" class="knopf-haupt" data-tun="freigeben" data-id="${f.id}">Freigeben</button>
      <button type="button" class="knopf" style="border:0.5px solid rgba(255,255,255,.2)" data-tun="aendern">Ändern</button>
    </div>`}
</div>`;
}

export const claudeNeu: Seite = {
  async rendern(z) {
    const liste = await z.quelle.auftraege(12);
    return html`
<div class="seite">
  ${kopfZurueck("Claude")}
  ${eingabe("Was soll ich für dich tun?", null)}
  <div style="display:flex;flex-wrap:wrap;gap:8px">
    ${VORSCHLAEGE.map((v) => html`<button type="button" class="glas knopf-klein" data-tun="vorschlag" data-text="${v}">${v}</button>`)}
  </div>
  ${liste.length ? html`
  <section class="glas karte">
    <span class="etikett">Zuletzt</span>
    <div class="liste">
      ${liste.map((a) => html`<a href="#/claude/${a.id}" class="eintrag"><div class="mitte"><span class="name">${a.prompt}</span><span class="erklaerung">${a.status === "fertig" ? (a.antwort ?? "").slice(0, 90) : a.status === "fehler" ? "Fehlgeschlagen" : "Läuft …"}</span></div>${sym.weiter()}</a>`)}
    </div>
  </section>` : ""}
</div>`;
  },
  tun: {
    vorschlag: (el) => {
      const feld = document.querySelector<HTMLTextAreaElement>("#auftrag-text");
      if (feld) { feld.value = el.dataset.text ?? ""; feld.focus(); }
      return false;
    },
  },
  danach: (w, z) => auftragFormular(w, z),
};

export const claudeAuftrag: Seite = {
  async rendern(z, [id]) {
    const a = await z.quelle.auftrag(id!);
    if (!a) return html`<div class="seite">${kopfZurueck("Claude", "#/claude")}<p class="leer">Auftrag nicht gefunden.</p></div>`;
    const laeuft = a.status === "neu" || a.status === "laeuft";
    const offen = a.freigaben.filter((f) => f.status === "offen" || f.status === "spaeter").length;
    const aktuell = a.schritte.find((s) => s.status === "laeuft")?.text ?? a.schritte.at(-1)?.text;
    const pille = laeuft ? (aktuell ?? "Startet …") : a.status === "fehler" ? "Hat nicht geklappt" : offen ? "Vorschlag bereit" : "Erledigt";
    return html`
<div class="seite" style="gap:16px">
  <div style="display:flex;align-items:center;justify-content:space-between">
    <a href="#/" class="glas rundknopf" aria-label="Zur Zentrale">${sym.zurueck()}</a>
    <div class="glas pille" role="status"><span class="orb klein" aria-hidden="true"></span>${pille}</div>
    <span style="width:44px"></span>
  </div>
  <div class="rahmen${laeuft ? "" : " ruhig"}">
    <div class="rahmen-innen">
      <span class="orb${laeuft ? " arbeitet" : ""}" aria-hidden="true"></span>
      <span class="etikett">${laeuft ? "Claude arbeitet" : "Claude"}</span>
      <span class="jetzt-text">${laeuft ? (aktuell ?? "Liest sich ein …") : a.status === "fehler" ? "Abgebrochen" : "Fertig"}</span>
    </div>
  </div>
  <section class="glas karte" style="border-radius:32px;gap:14px">
    <div style="display:flex;flex-direction:column;gap:4px">
      <span class="etikett">Dein Auftrag</span>
      <span style="font-size:17px;line-height:1.35">„${a.prompt}“</span>
    </div>
    ${a.schritte.length ? html`<div style="display:flex;flex-direction:column;gap:8px">
      ${a.schritte.map((s) => html`<div class="schritt ${s.status}"><i></i><span style="color:${s.status === "fertig" ? "rgba(255,255,255,.92)" : "rgba(255,255,255,.75)"}">${s.text}</span></div>`)}
    </div>` : ""}
    ${a.antwort && !laeuft ? html`<div class="antwort"${a.status === "fehler" ? html` style="color:var(--warn)"` : ""}>${a.antwort}</div>` : ""}
    ${a.freigaben.map((f) => freigabeKarte(f, z))}
  </section>
  ${laeuft ? "" : html`<div id="nachfrage">${eingabe("Rückfrage oder Änderung …", a.id, "Weiter")}</div>`}
  <a href="#/" class="hinweis">Fertig</a>
</div>`;
  },
  tun: {
    freigeben: async (el, z) => {
      el.setAttribute("disabled", "");
      try {
        await z.quelle.entscheide(el.dataset.id!, "freigegeben");
        hinweis("Freigegeben. Die Zentrale führt es aus.");
        void z.neuLaden();
      } catch (e) {
        el.removeAttribute("disabled");
        hinweis(e instanceof Error ? e.message : "Hat nicht geklappt");
      }
    },
    aendern: () => {
      const feld = document.querySelector<HTMLTextAreaElement>("#nachfrage textarea");
      feld?.focus();
      feld?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    },
  },
  danach(w, z, [id]) {
    const weg = auftragFormular(w, z);
    const ab = z.quelle.beobachteAuftrag(id!, () => {
      // Nicht neu zeichnen, während getippt wird
      if (document.activeElement?.tagName === "TEXTAREA") return;
      z.neuZeichnen();
    });
    return () => { ab(); weg?.(); };
  },
};

/** Formular „Auftrag senden“ verdrahten (neu oder als Rückfrage mit Bezug). */
function auftragFormular(w: HTMLElement, z: Zustand): (() => void) | undefined {
  const form = w.querySelector<HTMLFormElement>("form[data-form=auftrag]");
  if (!form) return;
  const feld = form.querySelector("textarea")!;
  const senden = async (ev?: Event) => {
    ev?.preventDefault();
    const text = feld.value.trim();
    if (!text) { feld.focus(); return; }
    const knopf = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    knopf.disabled = true;
    try {
      const id = await z.quelle.auftragSenden(text, form.dataset.bezug ?? null);
      feld.value = "";
      feld.blur();
      gehe(`#/claude/${id}`);
    } catch (e) {
      knopf.disabled = false;
      hinweis(e instanceof Error ? e.message : "Auftrag ging nicht raus");
    }
  };
  form.addEventListener("submit", senden);
  // Return sendet, Shift+Return macht eine neue Zeile
  feld.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) void senden(e); });
  return undefined;
}
