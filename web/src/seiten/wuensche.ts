import { euro, euroGanz, heute, kannIchMirLeisten, kurzesDatum, parseBetrag, satz } from "@zentrale/core";
import { gehe, hinweis, type Seite, type Zustand } from "../app.ts";
import { html } from "../html.ts";
import { orbLeiste } from "../orb.ts";
import { kopfZurueck } from "./konten.ts";

let antwort: { text: string; passt: boolean; frage: string } | null = null;
/** Eingaben über das Neuzeichnen hinweg behalten */
let eingabe = { betrag: "", datum: "", konto: "" };

export const wuensche: Seite = {
  rendern(z) {
    const a = z.ansicht!;
    const liquide = a.konten.filter((k) => k.liquide);
    return html`
<div class="seite">
  ${kopfZurueck("Wünsche")}
  <form class="glas karte" data-form="leisten">
    <span class="etikett">Kann ich mir das leisten?</span>
    <div class="raster2">
      <div><label class="etikett" for="l-betrag">Betrag</label><input id="l-betrag" name="betrag" class="feld" inputmode="decimal" placeholder="1.800" autocomplete="off" required value="${eingabe.betrag}" /></div>
      <div><label class="etikett" for="l-datum">Wann</label><input id="l-datum" name="datum" class="feld" type="date" value="${eingabe.datum || heute()}" /></div>
    </div>
    <div><label class="etikett" for="l-konto">Von</label>
      <select id="l-konto" name="konto" class="feld">${liquide.map((k) => html`<option value="${k.id}" ${k.id === eingabe.konto ? "selected" : ""}>${k.name}</option>`)}</select>
    </div>
    <button type="submit" class="knopf-haupt">Durchrechnen</button>
    ${antwort ? html`
    <div class="antwort" role="status" style="${antwort.passt ? "border:0.5px solid rgba(94,242,194,.4)" : "border:0.5px solid rgba(255,181,154,.4)"}">
      <span>${antwort.text}</span>
      <button type="button" class="knopf-klein glas" data-tun="claudeFragen">Claude einen Plan machen lassen</button>
    </div>` : ""}
  </form>
  ${a.toepfe.map((t) => {
    const anteil = t.ziel ? Math.min(100, Math.round((t.stand / t.ziel) * 100)) : 0;
    return html`
  <section class="glas karte" style="gap:10px">
    <div class="zeile"><span class="etikett">${t.name}</span><span class="leise">${t.zieldatum ? `bis ${kurzesDatum(t.zieldatum)}` : ""}</span></div>
    <div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:30px;font-weight:200">${euroGanz(t.stand)} €</span><span class="leise">von ${euroGanz(t.ziel)} €</span><span class="leise" style="margin-left:auto">${anteil} %</span></div>
    <div class="balken"><span style="width:${anteil}%"></span></div>
    ${t.notiz ? html`<span class="leise">${t.notiz}</span>` : ""}
    <div class="knopfreihe">
      <button type="button" class="knopf-klein glas" data-tun="pruefen" data-betrag="${t.ziel - t.stand}" data-name="${t.name}">Wann geht das?</button>
      <button type="button" class="knopf-klein glas" data-tun="einzahlen" data-id="${t.id}">Stand ändern</button>
    </div>
  </section>`;
  })}
  <form class="glas karte" data-form="topf">
    <span class="etikett">Neuer Wunsch oder Rücklage</span>
    <div class="raster2">
      <div><label class="etikett" for="t-name">Name</label><input id="t-name" name="name" class="feld" required maxlength="60" /></div>
      <div><label class="etikett" for="t-ziel">Ziel</label><input id="t-ziel" name="ziel" class="feld" inputmode="decimal" placeholder="2.000" required /></div>
    </div>
    <button type="submit" class="knopf glas">Anlegen</button>
  </form>
</div>
${orbLeiste()}`;
  },
  tun: {
    pruefen: (el, z) => {
      const betrag = Number(el.dataset.betrag);
      if (betrag <= 0) { hinweis("Ziel schon erreicht."); return; }
      eingabe = { betrag: euroGanz(betrag), datum: heute(), konto: z.ansicht!.konten.find((k) => k.liquide)!.id };
      rechneLeisten(z, betrag, heute(), eingabe.konto, el.dataset.name);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    claudeFragen: async (_el, z) => {
      if (!antwort) return;
      const id = await z.quelle.auftragSenden(`${antwort.frage} Mach mir einen konkreten Plan mit Töpfen und Terminen.`);
      gehe(`#/claude/${id}`);
    },
    einzahlen: async (el, z) => {
      const t = z.ansicht!.toepfe.find((x) => x.id === el.dataset.id);
      if (!t) return;
      const neu = prompt(`Neuer Stand für „${t.name}“ in Euro`, String(t.stand / 100).replace(".", ","));
      if (neu === null) return;
      const c = parseBetrag(neu);
      if (c === null) { hinweis("Das ist kein Betrag."); return; }
      await z.quelle.topfSpeichern({ ...t, stand: c });
      await z.neuLaden();
    },
  },
  danach(w, z) {
    w.querySelector<HTMLFormElement>("form[data-form=leisten]")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(e.target as HTMLFormElement);
      const betrag = parseBetrag(String(f.get("betrag") ?? ""));
      if (!betrag) { hinweis("Bitte einen Betrag eingeben."); return; }
      eingabe = { betrag: String(f.get("betrag")), datum: String(f.get("datum") ?? ""), konto: String(f.get("konto")) };
      rechneLeisten(z, Math.abs(betrag), String(f.get("datum") || heute()), String(f.get("konto")));
    });
    w.querySelector<HTMLFormElement>("form[data-form=topf]")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target as HTMLFormElement);
      const ziel = parseBetrag(String(f.get("ziel") ?? ""));
      if (!ziel) { hinweis("Bitte ein Ziel in Euro eingeben."); return; }
      await z.quelle.topfSpeichern({ name: String(f.get("name")).trim(), ziel: Math.abs(ziel), stand: 0, zieldatum: null, prioritaet: 0, notiz: "" });
      await z.neuLaden();
      hinweis("Angelegt.");
    });
  },
};

function rechneLeisten(z: Zustand, betrag: number, datum: string, kontoId: string, name?: string) {
  const a = z.ansicht!;
  const k = a.konten.find((x) => x.id === kontoId)!;
  const r = kannIchMirLeisten(a, betrag, kontoId, datum < heute() ? heute() : datum, { von: heute() });
  const was = name ? `${name} (${euro(betrag)})` : euro(betrag);
  const text = r.passt
    ? `Ja. ${was} am ${kurzesDatum(r.datum)} von ${k.name}: Der Tiefpunkt bleibt bei ${euro(r.tiefpunktNachher.saldo)} am ${kurzesDatum(r.tiefpunktNachher.datum)}, über deinem Puffer von ${euro(r.puffer)}.`
    : r.tiefpunktVorher.saldo < r.puffer
      ? `Gerade nicht. Schon ohne diese Ausgabe fällt ${k.name} am ${kurzesDatum(r.tiefpunktVorher.datum)} auf ${euro(r.tiefpunktVorher.saldo)}, unter den Puffer.${r.fruehestens ? ` Frühestens am ${kurzesDatum(r.fruehestens)}.` : ""}`
      : `Am ${kurzesDatum(r.datum)} nicht: Der Tiefpunkt fiele auf ${euro(r.tiefpunktNachher.saldo)}. ${r.fruehestens ? `Frühestens am ${kurzesDatum(r.fruehestens)}.` : "Im nächsten halben Jahr nicht ohne den Puffer zu reißen."}`;
  antwort = { text: satz(text), passt: r.passt, frage: `Kann ich mir ${was} am ${kurzesDatum(r.datum)} von ${k.name} leisten?` };
  z.neuZeichnen();
}
