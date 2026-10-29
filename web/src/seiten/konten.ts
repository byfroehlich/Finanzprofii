import { BEREICHE, euro, euroGanz, heute, kurzesDatum, plusTage, type Buchung } from "@zentrale/core";
import type { Seite, Zustand } from "../app.ts";
import { html } from "../html.ts";
import { kurve } from "../kurve.ts";
import { orbLeiste } from "../orb.ts";
import { sym } from "../symbole.ts";

export function kopfZurueck(titel: string, ziel = "#/") {
  return html`<header class="kopf-klein"><a href="${ziel}" class="glas rundknopf" aria-label="Zurück">${sym.zurueck()}</a><h1>${titel}</h1></header>`;
}

export function buchungsZeile(b: Buchung, kontoName?: string) {
  const plus = b.betrag > 0;
  return html`
<div class="eintrag">
  <div class="mitte">
    <span class="name">${b.gegenpartei || b.zweck || "Ohne Text"}</span>
    <span class="erklaerung">${b.erklaerung ?? "Noch nicht erklärt – Claude schaut es sich an."}</span>
    <span class="leise" style="font-size:12px">${kurzesDatum(b.datum)}${kontoName ? ` · ${kontoName}` : ""}${b.bereich ? ` · ${BEREICHE[b.bereich]}` : ""}</span>
  </div>
  <span class="betrag ${plus ? "plus" : ""}">${euro(b.betrag, true)}</span>
</div>`;
}

export const konten: Seite = {
  rendern(z) {
    const a = z.ansicht!;
    const p = z.prognose!;
    return html`
<div class="seite">
  ${kopfZurueck("Konten")}
  <section class="glas karte">
    <span class="etikett">Alle liquiden Konten</span>
    <div style="display:flex;align-items:baseline;gap:10px">
      <span class="gross">${euroGanz(p.gesamt.start.saldo)}</span><span class="leise">€ heute</span>
      <span class="tief" style="margin-left:auto">Tiefpunkt ${euroGanz(p.gesamt.tiefpunkt.saldo)} € · ${kurzesDatum(p.gesamt.tiefpunkt.datum)}</span>
    </div>
    ${kurve(p.gesamt.punkte, { hoehe: 120, beschriftung: true, puffer: p.gesamt.puffer })}
    <span class="leise">In 6 Monaten voraussichtlich ${euro(p.gesamt.ende.saldo)}</span>
  </section>
  ${a.konten.map((k) => {
    const v = p.konten.find((x) => x.kontoId === k.id);
    return html`
  <a href="#/konto/${k.id}" class="glas karte">
    <div class="zeile"><span class="etikett">${k.name} · ${k.bank}</span><span class="leise">${kurzesDatum(k.saldoDatum)}</span></div>
    <div style="display:flex;align-items:baseline;gap:10px">
      <span style="font-size:30px;font-weight:200;letter-spacing:-.02em">${euroGanz(k.saldo)} €</span>
      ${v ? html`<span class="tief${v.minus ? " rot" : ""}" style="margin-left:auto">Tief ${euroGanz(v.tiefpunkt.saldo)} €</span>` : html`<span class="leise" style="margin-left:auto">Kredit</span>`}
    </div>
    ${v ? kurve(v.punkte, { hoehe: 48, puffer: k.puffer }) : ""}
    ${k.liquide ? "" : html`<span class="leise">Zählt nicht zur verfügbaren Liquidität.</span>`}
  </a>`;
  })}
</div>
${orbLeiste()}`;
  },
};

export const konto: Seite = {
  async rendern(z: Zustand, [id]) {
    const a = z.ansicht!;
    const k = a.konten.find((x) => x.id === id);
    if (!k) return html`<div class="seite">${kopfZurueck("Konto", "#/konten")}<p class="leer">Dieses Konto gibt es nicht.</p></div>`;
    const v = z.prognose!.konten.find((x) => x.kontoId === k.id);
    const h = heute();
    const kommt = (v?.ereignisse ?? []).filter((e) => e.datum <= plusTage(h, 45));
    const buchungen = await z.quelle.buchungen(k.id, 60);
    return html`
<div class="seite">
  ${kopfZurueck(k.name, "#/konten")}
  <section class="glas karte">
    <div class="zeile"><span class="etikett">${k.bank} · Stand ${kurzesDatum(k.saldoDatum)}</span><span class="leise">Puffer ${euroGanz(k.puffer)} €</span></div>
    <span class="riesig">${euroGanz(k.saldo)} <span style="font-size:20px" class="leise">€</span></span>
    ${v ? html`
    <div class="zeile"><span class="tief${v.minus ? " rot" : ""}">Tiefpunkt ${euro(v.tiefpunkt.saldo)} am ${kurzesDatum(v.tiefpunkt.datum)}</span><span class="leise">in 6 Monaten ${euroGanz(v.ende.saldo)} €</span></div>
    ${kurve(v.punkte, { hoehe: 140, beschriftung: true, puffer: k.puffer })}
    ${v.minus ? html`<div class="band">Ab ${kurzesDatum(v.minus.datum)} im Minus. Frag Claude nach einem Zahlungsplan.</div>` : v.knapp ? html`<div class="band">Ab ${kurzesDatum(v.knapp.datum)} unter dem Puffer.</div>` : ""}` : ""}
  </section>
  ${v ? html`
  <section class="glas karte">
    <span class="etikett">Kommt noch · 45 Tage</span>
    <div class="liste">
      ${kommt.length ? kommt.map((e) => html`
      <div class="eintrag">
        <span class="marke">${kurzesDatum(e.datum)}</span>
        <div class="mitte"><span class="name">${e.titel}</span>${e.sicherheit !== "sicher" ? html`<span class="erklaerung">${e.sicherheit === "wahrscheinlich" ? "geschätzt" : "unsicher, nicht eingerechnet"}</span>` : ""}</div>
        <span class="betrag ${e.betrag > 0 ? "plus" : ""}">${euro(e.betrag, true)}</span>
      </div>`) : html`<span class="leer">Nichts geplant.</span>`}
    </div>
  </section>` : ""}
  <section class="glas karte">
    <span class="etikett">Zuletzt</span>
    <div class="liste">${buchungen.length ? buchungen.map((b) => buchungsZeile(b)) : html`<span class="leer">Noch keine Buchungen.</span>`}</div>
  </section>
</div>
${orbLeiste()}`;
  },
};
