import { BEREICHE, euro, euroGanz, heute, kurzesDatum, plusTage, RHYTHMEN } from "@zentrale/core";
import type { Seite } from "../app.ts";
import { html } from "../html.ts";
import { orbLeiste } from "../orb.ts";
import { buchungsZeile, kopfZurueck } from "./konten.ts";

const STATUS = { rueckstand: "Rückstand", gestundet: "gestundet", ratenzahlung: "Raten", geklaert: "geklärt" } as const;

export const offen: Seite = {
  rendern(z) {
    const a = z.ansicht!;
    const v = a.verbindlichkeiten.filter((x) => x.status !== "geklaert");
    const summe = v.reduce((s, x) => s + x.betragOffen, 0);
    const vertraege = [...a.vertraege].filter((x) => x.aktiv && x.betrag < 0).sort((x, y) => x.betrag - y.betrag);
    const monatlich = vertraege.reduce((s, x) => s + (x.rhythmus === "monat" ? x.betrag : x.rhythmus === "quartal" ? x.betrag / 3 : x.rhythmus === "jahr" ? x.betrag / 12 : x.rhythmus === "halbjahr" ? x.betrag / 6 : x.betrag * 4.33), 0);
    return html`
<div class="seite">
  ${kopfZurueck("Offen und fest")}
  <section class="glas karte">
    <div class="zeile"><span class="etikett">Offene Posten</span><span class="leise">${euro(summe)}</span></div>
    <div class="liste">
      ${v.length ? v.map((x) => html`<div class="eintrag"><span class="marke">${STATUS[x.status]}</span><div class="mitte"><span class="name">${x.glaeubiger}</span><span class="erklaerung">${x.planpostenId ? "eingeplant" : "noch nicht eingeplant"}${x.faellig ? ` · fällig ${kurzesDatum(x.faellig)}` : ""}${x.notiz ? ` · ${x.notiz}` : ""}</span></div><span class="betrag">${euro(x.betragOffen)}</span></div>`) : html`<span class="leer">Nichts offen.</span>`}
    </div>
  </section>
  <section class="glas karte">
    <span class="etikett">Fristen und Termine</span>
    <div class="liste">
      ${a.fristen.filter((f) => f.art !== "anreise" && f.art !== "abreise").map((f) => html`<div class="eintrag"><span class="marke${f.datum < heute() ? " rot" : ""}">${kurzesDatum(f.datum)}</span><div class="mitte"><span class="name">${f.titel}</span><span class="erklaerung">${BEREICHE[f.bereich]}</span></div></div>`)}
    </div>
  </section>
  <section class="glas karte">
    <div class="zeile"><span class="etikett">Feste Ausgaben</span><span class="leise">≈ ${euroGanz(-monatlich)} € im Monat</span></div>
    <div class="liste">
      ${vertraege.map((x) => html`<div class="eintrag"><div class="mitte"><span class="name">${x.name}</span><span class="erklaerung">${RHYTHMEN[x.rhythmus]} · nächste ${kurzesDatum(x.naechsteFaelligkeit)}${x.ende ? ` · bis ${kurzesDatum(x.ende)}` : ""}</span></div><span class="betrag">${euro(x.betrag)}</span></div>`)}
    </div>
  </section>
</div>
${orbLeiste()}`;
  },
};

export const vermietung: Seite = {
  rendern(z) {
    const a = z.ansicht!;
    const h = heute();
    const termine = a.fristen.filter((f) => (f.art === "anreise" || f.art === "abreise") && f.datum <= plusTage(h, 30));
    const auszahlungen = a.planposten.filter((p) => p.bereich === "vermietung" && p.betrag > 0).sort((x, y) => (x.datum < y.datum ? -1 : 1));
    const summe = auszahlungen.filter((p) => p.datum <= plusTage(h, 30)).reduce((s, p) => s + p.betrag, 0);
    const buchungen = a.buchungen.filter((b) => b.bereich === "vermietung").slice(0, 15);
    return html`
<div class="seite">
  ${kopfZurueck("Vermietung")}
  <section class="glas karte">
    <div class="zeile"><span class="etikett">Erwartete Auszahlungen · 30 Tage</span></div>
    <span class="gross">${euroGanz(summe)} <span class="leise" style="font-size:15px">€</span></span>
    <div class="liste">
      ${auszahlungen.length ? auszahlungen.slice(0, 8).map((p) => html`<div class="eintrag"><span class="marke">${kurzesDatum(p.datum)}</span><div class="mitte"><span class="name">${p.titel}</span>${p.sicherheit !== "sicher" ? html`<span class="erklaerung">geschätzt</span>` : ""}</div><span class="betrag plus">${euro(p.betrag, true)}</span></div>`) : html`<span class="leer">Keine Auszahlungen geplant. Mit Smoobu verbunden kommen sie automatisch.</span>`}
    </div>
  </section>
  <section class="glas karte">
    <span class="etikett">An- und Abreisen</span>
    <div class="liste">
      ${termine.length ? termine.map((f) => html`<div class="eintrag"><span class="marke">${f.datum === h ? "heute" : kurzesDatum(f.datum)}</span><div class="mitte"><span class="name">${f.titel}</span></div></div>`) : html`<span class="leer">Keine in den nächsten 30 Tagen.</span>`}
    </div>
  </section>
  <section class="glas karte">
    <span class="etikett">Zuletzt</span>
    <div class="liste">${buchungen.length ? buchungen.map((b) => buchungsZeile(b, a.konten.find((k) => k.id === b.kontoId)?.name)) : html`<span class="leer">Noch keine Buchungen.</span>`}</div>
  </section>
</div>
${orbLeiste()}`;
  },
};
