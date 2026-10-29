import {
  beschreibeAktion, euroGanz, heute, kurzesDatum, langesDatum, naechsterGrosserEingang, plusTage, tageZwischen,
  tiefpunktBis, warnungen, type Verlauf,
} from "@zentrale/core";
import { begruessung, hinweis, type Seite, type Zustand } from "../app.ts";
import { html } from "../html.ts";
import { kurve } from "../kurve.ts";
import { orbLeiste } from "../orb.ts";
import { sym } from "../symbole.ts";

let erledigtInSitzung = 0;

function pulsVerlauf(z: Zustand): Verlauf | null {
  const p = z.prognose;
  if (!p?.konten.length) return null;
  const liquide = p.konten.filter((v) => z.ansicht!.konten.find((k) => k.id === v.kontoId)?.liquide);
  const auswahl = liquide.length ? liquide : p.konten;
  return auswahl.find((v) => v.kontoId === z.pulsKonto) ?? auswahl[0]!;
}

function geldPuls(z: Zustand) {
  const v = pulsVerlauf(z);
  if (!v) return html`<div class="glas karte"><span class="etikett">Geld-Puls</span><span class="leer">Noch keine Konten. Sobald der erste Kontoauszug drin ist, siehst du hier deinen Verlauf.</span></div>`;
  const h = heute();
  const eingang = naechsterGrosserEingang(v);
  // Bis kurz nach dem nächsten großen Eingang zeigen, mindestens 3, höchstens 8 Wochen
  const bis = eingang && tageZwischen(h, eingang.datum) <= 56 ? plusTage(eingang.datum, Math.max(2, 21 - tageZwischen(h, eingang.datum))) : plusTage(h, 45);
  const tief = tiefpunktBis(v, eingang ? eingang.datum : bis);
  const punkte = v.punkte.filter((p) => p.datum <= bis);
  const ausgaenge = v.ereignisse.filter((e) => e.betrag < 0 && e.datum <= tief.datum).sort((a, b) => a.betrag - b.betrag).slice(0, 2).map((e) => e.titel);
  const satz = [
    ausgaenge.length ? `Nach ${ausgaenge.join(" und ")}` : "",
    eingang ? `${eingang.titel} hebt ab ${kurzesDatum(eingang.datum)} wieder an` : "",
  ].filter(Boolean).join(" · ") || "Keine größeren Bewegungen in Sicht";
  const mehrere = (z.prognose?.konten.length ?? 0) > 1;
  return html`
<a href="#/konto/${v.kontoId}" class="glas karte" style="gap:10px">
  <div class="zeile">
    <span class="etikett">Geld-Puls · ${v.name}</span>
    <span class="leise">bis ${kurzesDatum(bis)}</span>
  </div>
  <div style="display:flex;align-items:baseline;gap:10px">
    <span class="gross">${euroGanz(v.start.saldo)}</span>
    <span class="leise" style="font-size:15px">€ heute</span>
    <span class="tief${tief.saldo < 0 ? " rot" : ""}" style="margin-left:auto">Tiefpunkt ${euroGanz(tief.saldo)} €</span>
  </div>
  ${kurve(punkte, { puffer: v.puffer })}
  <span class="leise">${satz}</span>
</a>
${mehrere ? html`<button type="button" class="hinweis" data-tun="pulsWechseln" style="margin-top:-8px">Anderes Konto zeigen</button>` : ""}`;
}

function warteAufDich(z: Zustand) {
  const liste = z.ansicht?.freigaben ?? [];
  const i = Math.min(z.karte, liste.length);
  const karte = liste[i];
  const kontoName = (id: string) => z.ansicht?.konten.find((k) => k.id === id)?.name ?? id;
  const gesamt = liste.length + erledigtInSitzung;
  return html`
<section class="glas karte" aria-label="Wartet auf dich">
  <div class="zeile">
    <span class="etikett">Wartet auf dich</span>
    <span class="leise">${gesamt ? `${erledigtInSitzung} von ${gesamt} erledigt` : ""}</span>
  </div>
  ${karte
    ? html`
  <div style="display:flex;flex-direction:column;gap:10px">
    <span class="karten-titel">${karte.titel}</span>
    ${karte.text ? html`<span class="karten-text">${karte.text}</span>` : ""}
    <span class="aktion">${beschreibeAktion(karte.aktion, kontoName)}</span>
    <div class="knopfreihe" style="margin-top:4px">
      <button type="button" class="knopf-haupt" data-tun="freigeben" data-id="${karte.id}">${sym.faceid()} Freigeben</button>
      <button type="button" class="knopf glas" data-tun="spaeter" data-id="${karte.id}">Später</button>
    </div>
  </div>`
    : html`<span style="font-size:18px;font-weight:300;color:rgba(255,255,255,.85)">Alles erledigt. Ich melde mich, sobald es etwas Neues gibt.</span>`}
  ${gesamt > 1 ? html`<div class="punkte">${Array.from({ length: gesamt }, (_, k) => html`<span class="${k < erledigtInSitzung ? "fertig" : k === erledigtInSitzung + i ? "jetzt" : ""}"></span>`)}</div>` : ""}
</section>`;
}

function statusKarte(z: Zustand) {
  const a = z.ansicht!;
  const demo = z.quelle.art === "demo";
  const erfolge = a.abrufe.map((x) => x.letzterErfolg).filter(Boolean).sort().reverse();
  const zuletzt = erfolge[0] ? new Date(erfolge[0]).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : null;
  const gestoert = a.abrufe.filter((x) => x.letzterVersuch && x.letzterVersuch !== x.letzterErfolg);
  const lampe = demo ? "gelb" : gestoert.length ? "gelb" : erfolge.length ? "" : "aus";
  const text = demo ? "Beispieldaten · nicht verbunden" : gestoert.length ? `${gestoert.length} Quelle hakt · Stand ${zuletzt ?? "–"}` : zuletzt ? `Aktuell · Stand ${zuletzt} · ${a.abrufe.length} Quellen` : "Noch kein automatischer Abruf";
  return html`
<a href="#/steuerung" class="glas status">
  <div class="vorschau"><i style="left:8px;top:9px;width:46px;height:30px;background:rgba(255,255,255,.16)"></i><i style="left:40px;top:20px;width:44px;height:30px;background:rgba(255,255,255,.26)"></i></div>
  <div style="flex:1;display:flex;flex-direction:column;gap:4px;min-width:0">
    <span style="font-size:17px;font-weight:500">Zentrale · ${a.konten.length} Konten</span>
    <span class="leise" style="display:flex;align-items:center;gap:6px"><span class="lampe ${lampe}"></span>${text}</span>
  </div>
  ${sym.weiter()}
</a>`;
}

function heuteKarte(z: Zustand) {
  const h = heute();
  const w = z.prognose ? warnungen(z.ansicht!, z.prognose, h).slice(0, 3) : [];
  // Fristen, die schon als Warnung oben stehen, nicht doppelt zeigen
  const gewarnt = new Set(w.map((x) => x.schluessel.split(":")[1]));
  const termine = (z.ansicht?.fristen ?? []).filter((f) => f.datum <= plusTage(h, 7) && !gewarnt.has(f.id)).slice(0, 5);
  if (!w.length && !termine.length) return "";
  const wann = (d: string) => (d === h ? "heute" : d === plusTage(h, 1) ? "morgen" : d < h ? `seit ${kurzesDatum(d)}` : kurzesDatum(d));
  return html`
<section class="glas karte" aria-label="Heute">
  <span class="etikett">Heute und diese Woche</span>
  <div class="liste">
    ${w.map((x) => html`<div class="eintrag"><span class="lampe ${x.stufe === "rot" ? "" : "gelb"}" style="margin-top:7px;${x.stufe === "rot" ? "background:var(--rot)" : ""}"></span><div class="mitte"><span style="font-size:15px">${x.titel}</span><span class="erklaerung">${x.text}</span></div></div>`)}
    ${termine.map((f) => html`<div class="eintrag"><span class="marke">${wann(f.datum)}</span><div class="mitte"><span class="name">${f.titel}</span></div></div>`)}
  </div>
</section>`;
}

export const start: Seite = {
  rendern(z) {
    const a = z.ansicht!;
    const verbindlich = a.verbindlichkeiten.filter((v) => v.status !== "geklaert").length;
    return html`
<div class="seite">
  <header class="kopf">
    <div style="display:flex;flex-direction:column;gap:4px">
      <span class="etikett">${langesDatum(heute())}</span>
      <h1>${begruessung()}, <span class="grad">Mathias</span></h1>
    </div>
    <a href="#/steuerung" class="glas rundknopf" aria-label="Steuerung">${sym.regler()}</a>
  </header>
  ${statusKarte(z)}
  ${warteAufDich(z)}
  ${geldPuls(z)}
  ${heuteKarte(z)}
  <nav class="bereiche" aria-label="Bereiche">
    <a href="#/konten" class="glas bereich">${sym.konten()}<span>Konten</span></a>
    <a href="#/vermietung" class="glas bereich">${sym.haus()}<span>Vermietung</span></a>
    <a href="#/wuensche" class="glas bereich">${sym.stern()}<span>Wünsche</span></a>
    <a href="#/offen" class="glas bereich">${sym.kalender()}<span>${verbindlich ? `Offen · ${verbindlich}` : "Offen"}</span></a>
  </nav>
  ${z.quelle.art === "demo" ? html`<p class="hinweis">Beispieldaten. Mit Supabase verbunden zeigt die App deine echten Zahlen.</p>` : ""}
</div>
${orbLeiste()}`;
  },
  tun: {
    freigeben: async (el, z) => {
      const id = el.dataset.id!;
      el.setAttribute("disabled", "");
      try {
        await z.quelle.entscheide(id, "freigegeben");
        erledigtInSitzung++;
        z.ansicht!.freigaben = z.ansicht!.freigaben.filter((f) => f.id !== id);
        hinweis("Freigegeben. Die Zentrale führt es aus.");
      } catch (e) {
        hinweis(e instanceof Error ? e.message : "Hat nicht geklappt");
      }
    },
    spaeter: (_el, z) => {
      z.karte++;
      if (z.karte >= (z.ansicht?.freigaben.length ?? 0)) z.karte = 0;
    },
    pulsWechseln: (_el, z) => {
      const liste = z.prognose!.konten.filter((v) => z.ansicht!.konten.find((k) => k.id === v.kontoId)?.liquide);
      const auswahl = liste.length ? liste : z.prognose!.konten;
      const i = auswahl.findIndex((v) => v.kontoId === (z.pulsKonto ?? auswahl[0]!.kontoId));
      z.pulsKonto = auswahl[(i + 1) % auswahl.length]!.kontoId;
    },
  },
};

